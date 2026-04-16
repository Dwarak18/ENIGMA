'use strict';

const { ethers } = require('ethers');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../logger');

const DEFAULT_ABI = [
  'function storeRecord(string deviceId, uint256 timestamp, string hash) external',
];

const RETRY_INTERVAL_MS = config.blockchain.retryIntervalMs;
const RETRY_BATCH_SIZE = config.blockchain.retryBatchSize;

let retryTimer = null;

let provider = null;
let signer = null;
let contract = null;

function initClient() {
  if (contract) return contract;

  const { rpcUrl, privateKey, contractAddress, enabled } = config.blockchain;
  if (!enabled || !rpcUrl || !privateKey || !contractAddress) {
    logger.warn('Blockchain integration disabled: missing RPC_URL, PRIVATE_KEY, or CONTRACT_ADDRESS');
    return null;
  }

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    signer = new ethers.Wallet(privateKey, provider);
    contract = new ethers.Contract(contractAddress, DEFAULT_ABI, signer);
    logger.info('Blockchain client initialized', { contractAddress });
    return contract;
  } catch (err) {
    logger.error('Blockchain client init failed', { error: err.message || String(err) });
    return null;
  }
}

async function storeHashOnChain(deviceId, timestamp, hash) {
  const client = initClient();
  if (!client) {
    const err = new Error('Blockchain client unavailable');
    err.code = 'BLOCKCHAIN_UNAVAILABLE';
    throw err;
  }

  const tx = await client.storeRecord(String(deviceId), BigInt(timestamp), String(hash));
  const receipt = await tx.wait(1);
  const txHash = receipt && receipt.hash ? receipt.hash : tx.hash;

  logger.info('Blockchain transaction confirmed', {
    device_id: deviceId,
    timestamp,
    tx_hash: txHash,
  });

  return txHash;
}

async function enqueuePendingRecord(deviceId, timestamp, hash, errorMessage) {
  await pool.query(
    `INSERT INTO pending_blockchain (device_id, timestamp, entropy_hash, status, retry_count, last_error, next_retry_at)
     VALUES ($1, $2, $3, 'pending', 0, $4, NOW())
     ON CONFLICT (device_id, timestamp, entropy_hash)
     DO UPDATE SET
       status = 'pending',
       last_error = EXCLUDED.last_error,
       next_retry_at = NOW(),
       updated_at = NOW()`,
    [deviceId, timestamp, hash, errorMessage || 'initial enqueue']
  );
}

async function markRecordSuccess(id, txHash) {
  await pool.query(
    `UPDATE pending_blockchain
     SET status = 'confirmed',
         tx_hash = $2,
         confirmed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [id, txHash]
  );
}

async function markRecordFailure(id, retryCount, errorMessage) {
  // Exponential backoff capped at 10 minutes.
  const delaySeconds = Math.min(600, Math.max(10, 2 ** Math.min(retryCount, 9)));
  await pool.query(
    `UPDATE pending_blockchain
     SET status = 'pending',
         retry_count = retry_count + 1,
         last_error = $2,
         next_retry_at = NOW() + make_interval(secs => $3),
         updated_at = NOW()
     WHERE id = $1`,
    [id, errorMessage, delaySeconds]
  );
}

async function processPendingBatch() {
  const res = await pool.query(
    `SELECT id, device_id, timestamp, entropy_hash, retry_count
     FROM pending_blockchain
     WHERE status = 'pending'
       AND next_retry_at <= NOW()
     ORDER BY created_at ASC
     LIMIT $1`,
    [RETRY_BATCH_SIZE]
  );

  for (const row of res.rows) {
    try {
      const txHash = await storeHashOnChain(row.device_id, Number(row.timestamp), row.entropy_hash);
      await markRecordSuccess(row.id, txHash);
      logger.info('Pending blockchain record confirmed', {
        id: row.id,
        device_id: row.device_id,
        tx_hash: txHash,
      });
    } catch (err) {
      const errorMessage = err.message || String(err);
      await markRecordFailure(row.id, row.retry_count + 1, errorMessage);
      logger.error('Pending blockchain retry failed', {
        id: row.id,
        device_id: row.device_id,
        error: errorMessage,
      });
    }
  }
}

function runAsyncStore(deviceId, timestamp, hash) {
  setImmediate(async () => {
    try {
      const txHash = await storeHashOnChain(deviceId, timestamp, hash);
      logger.info('Blockchain transaction hash', {
        device_id: deviceId,
        timestamp,
        tx_hash: txHash,
      });
    } catch (err) {
      const errorMessage = err.message || String(err);

      if (err.code === 'BLOCKCHAIN_UNAVAILABLE') {
        logger.warn('Blockchain unavailable; skipping on-chain write for now', {
          device_id: deviceId,
          timestamp,
          error: errorMessage,
        });
        return;
      }

      logger.error('Blockchain write failed; queued for retry', {
        device_id: deviceId,
        timestamp,
        error: errorMessage,
      });
      try {
        await enqueuePendingRecord(deviceId, timestamp, hash, errorMessage);
      } catch (queueErr) {
        logger.error('Failed to enqueue pending blockchain record', {
          device_id: deviceId,
          timestamp,
          error: queueErr.message || String(queueErr),
        });
      }
    }
  });
}

function startRetryWorker() {
  if (retryTimer) return;
  if (!config.blockchain.enabled) {
    logger.info('Blockchain retry worker disabled by configuration');
    return;
  }

  retryTimer = setInterval(() => {
    processPendingBatch().catch((err) => {
      logger.error('Blockchain retry worker loop failed', {
        error: err.message || String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  logger.info('Blockchain retry worker started', {
    retry_interval_ms: RETRY_INTERVAL_MS,
    retry_batch_size: RETRY_BATCH_SIZE,
  });
}

function stopRetryWorker() {
  if (!retryTimer) return;
  clearInterval(retryTimer);
  retryTimer = null;
}

module.exports = {
  storeHashOnChain,
  runAsyncStore,
  startRetryWorker,
  stopRetryWorker,
};
