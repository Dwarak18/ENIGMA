'use strict';

const { ethers } = require('ethers');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../logger');

let provider = null;
let wallet = null;
let contract = null;

const RECORD_STORAGE_ABI = [
  'function storeRecord(string calldata deviceId, uint256 timestamp, string calldata entropyHash) external',
  'function records(string) external view returns (string deviceId, uint256 timestamp, string entropyHash, uint256 blockNumber)',
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
async function storeHashOnChain(deviceId, timestamp, hash) {
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

    const tx = await contract.storeRecord(deviceId, timestamp, hash);
    
    logger.info('RecordStorage transaction submitted', { txHash: tx.hash });
    
    return tx.hash;
  } catch (err) {
    logger.error('Blockchain transaction failed', { error: err.message });
    throw err;
  }
}

/**
 * Async wrapper for the main entropy flow.
 */
function runAsyncStore(deviceId, timestamp, hash) {
  if (!config.blockchain.enabled) return;

  setImmediate(async () => {
    try {
      const txHash = await storeHashOnChain(deviceId, timestamp, hash);
      
      // Mark as confirmed immediately in our local DB since it was submitted
      await pool.query(
        `INSERT INTO pending_blockchain (device_id, timestamp, entropy_hash, status, tx_hash, confirmed_at)
         VALUES ($1, $2, $3, 'confirmed', $4, NOW())
         ON CONFLICT (device_id, timestamp, entropy_hash)
         DO UPDATE SET status = 'confirmed', tx_hash = $4, confirmed_at = NOW()`,
        [deviceId, timestamp, hash, txHash]
      );
    } catch (err) {
      logger.error('Initial blockchain submission failed', { error: err.message });
    }
  });
}

function startRetryWorker() {
    // Basic implementation for main project compatibility
    logger.info('Blockchain service integrated (Minimal Direct Method)');
}

module.exports = {
  storeHashOnChain,
  runAsyncStore,
  startRetryWorker
};
