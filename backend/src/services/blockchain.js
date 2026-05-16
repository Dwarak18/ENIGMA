'use strict';

const { ethers } = require('ethers');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../logger');

let provider = null;
let wallet = null;
let contract = null;
let retryWorkerStarted = false;
let retryCycleRunning = false;

const RECORD_STORAGE_ABI = [
  'function storeRecord(string calldata deviceId, uint256 timestamp, string calldata entropyHash) external',
  'function records(string) external view returns (string deviceId, uint256 timestamp, bytes32 integrityHash, uint256 blockNumber, bool verified)',
  'function getRecordCount() external view returns (uint256)',
];

/**
 * Initialize the Ethereum client using local provider and the backend's private key.
 */
function initClient() {
  if (wallet) return wallet;

  const { rpcUrl, privateKey, enabled } = config.blockchain;
  if (!enabled) return null;

  if (!rpcUrl || !privateKey || privateKey === '0xYOUR_PRIVATE_KEY') {
    logger.warn('Blockchain integration enabled but missing RPC_URL or PRIVATE_KEY in backend/.env');
    return null;
  }

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(privateKey, provider);

    logger.info('Blockchain client initialized (Local Hardhat)', {
      walletAddress: wallet.address,
      network: 'Local'
    });
    return wallet;
  } catch (err) {
    logger.error('Blockchain client init failed', { error: err.message });
    return null;
  }
}

/**
 * Anchors a record in the RecordStorage smart contract.
 */
async function storeRecord(deviceId, timestamp, entropyHash) {
  const signer = initClient();
  if (!signer) {
    const err = new Error('Blockchain client unavailable');
    err.code = 'BLOCKCHAIN_UNAVAILABLE';
    throw err;
  }

  try {
    if (!config.blockchain.contractAddress || !ethers.isAddress(config.blockchain.contractAddress)) {
      const err = new Error('CONTRACT_ADDRESS is missing or invalid');
      err.code = 'CONTRACT_UNAVAILABLE';
      throw err;
    }

    if (!contract) {
      contract = new ethers.Contract(
        config.blockchain.contractAddress,
        RECORD_STORAGE_ABI,
        signer
      );
    }

    logger.info('Anchoring record in RecordStorage...', { deviceId, timestamp });

    const tx = await contract.storeRecord(deviceId, timestamp, entropyHash);

    logger.info('RecordStorage transaction submitted', { txHash: tx.hash });

    return tx.hash;
  } catch (err) {
    logger.error('Blockchain transaction failed', { error: err.message });
    throw err;
  }
}

/* Backward-compatible alias for older call sites */
async function storeHashOnChain(deviceId, timestamp, hash) {
  return storeRecord(deviceId, timestamp, hash);
}

function normalizeErrorMessage(err) {
  const raw = err && err.message ? err.message : String(err);
  return raw.slice(0, 500);
}

async function markPending(deviceId, timestamp, hash) {
  await pool.query(
    `INSERT INTO pending_blockchain (device_id, timestamp, entropy_hash, status, next_retry_at, updated_at)
     VALUES ($1, $2, $3, 'pending', NOW(), NOW())
     ON CONFLICT (device_id, timestamp, entropy_hash)
     DO UPDATE SET status = 'pending', last_error = NULL, next_retry_at = NOW(), updated_at = NOW()`,
    [deviceId, timestamp, hash]
  );
}

async function markConfirmed(deviceId, timestamp, hash, txHash) {
  await pool.query(
    `INSERT INTO pending_blockchain (device_id, timestamp, entropy_hash, status, tx_hash, confirmed_at, updated_at)
     VALUES ($1, $2, $3, 'confirmed', $4, NOW(), NOW())
     ON CONFLICT (device_id, timestamp, entropy_hash)
     DO UPDATE SET
       status = 'confirmed',
       tx_hash = EXCLUDED.tx_hash,
       confirmed_at = NOW(),
       last_error = NULL,
       updated_at = NOW()`,
    [deviceId, timestamp, hash, txHash]
  );
}

async function markFailed(deviceId, timestamp, hash, errorMessage) {
  const existing = await pool.query(
    `SELECT retry_count FROM pending_blockchain
     WHERE device_id = $1 AND timestamp = $2 AND entropy_hash = $3`,
    [deviceId, timestamp, hash]
  );

  const nextRetryCount = (existing.rows[0]?.retry_count || 0) + 1;
  const retryDelaySeconds = Math.min(30 * Math.pow(2, Math.min(nextRetryCount - 1, 5)), 600);

  await pool.query(
    `INSERT INTO pending_blockchain (
       device_id, timestamp, entropy_hash, status, retry_count, last_error, next_retry_at, updated_at
     )
     VALUES ($1, $2, $3, 'failed', $4, $5, NOW() + ($6 * INTERVAL '1 second'), NOW())
     ON CONFLICT (device_id, timestamp, entropy_hash)
     DO UPDATE SET
       status = 'failed',
       retry_count = $4,
       last_error = $5,
       next_retry_at = NOW() + ($6 * INTERVAL '1 second'),
       updated_at = NOW()`,
    [deviceId, timestamp, hash, nextRetryCount, errorMessage, retryDelaySeconds]
  );
}

/**
 * Async wrapper for the main entropy flow.
 */
function runAsyncStore(deviceId, timestamp, hash) {
  if (!config.blockchain.enabled) return;

  setImmediate(async () => {
    await markPending(deviceId, timestamp, hash);
    try {
      const txHash = await storeRecord(deviceId, timestamp, hash);
      await markConfirmed(deviceId, timestamp, hash, txHash);
    } catch (err) {
      const errorMessage = normalizeErrorMessage(err);
      await markFailed(deviceId, timestamp, hash, errorMessage);
      logger.error('Initial blockchain submission failed', { error: errorMessage, deviceId, timestamp });
    }
  });
}

async function runRetryCycle() {
  if (!config.blockchain.enabled || retryCycleRunning) return;

  retryCycleRunning = true;
  try {
    const batch = await pool.query(
      `SELECT device_id, timestamp, entropy_hash
       FROM pending_blockchain
       WHERE status IN ('pending', 'failed')
         AND next_retry_at <= NOW()
       ORDER BY next_retry_at ASC
       LIMIT $1`,
      [config.blockchain.retryBatchSize]
    );

    for (const row of batch.rows) {
      const deviceId = row.device_id;
      const timestamp = Number(row.timestamp);
      const hash = row.entropy_hash;

      try {
        const txHash = await storeRecord(deviceId, timestamp, hash);
        await markConfirmed(deviceId, timestamp, hash, txHash);
      } catch (err) {
        const errorMessage = normalizeErrorMessage(err);
        await markFailed(deviceId, timestamp, hash, errorMessage);
        logger.error('Retry blockchain submission failed', { error: errorMessage, deviceId, timestamp });
      }
    }
  } finally {
    retryCycleRunning = false;
  }
}

function startRetryWorker() {
  if (!config.blockchain.enabled) {
    logger.info('Blockchain retry worker disabled');
    return;
  }
  if (retryWorkerStarted) return;

  retryWorkerStarted = true;
  logger.info('Blockchain retry worker started', {
    interval_ms: config.blockchain.retryIntervalMs,
    batch_size: config.blockchain.retryBatchSize,
  });

  runRetryCycle().catch((err) => {
    logger.error('Initial blockchain retry cycle failed', { error: err.message || String(err) });
  });

  setInterval(() => {
    runRetryCycle().catch((err) => {
      logger.error('Blockchain retry cycle failed', { error: err.message || String(err) });
    });
  }, config.blockchain.retryIntervalMs);
}

module.exports = {
  storeRecord,
  storeHashOnChain,
  runAsyncStore,
  startRetryWorker
};
