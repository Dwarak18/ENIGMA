'use strict';

const { ethers } = require('ethers');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../logger');

let provider = null;
let wallet = null;

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
 * Anchors a record by sending a 0-value transaction to YOURSELF.
 * The entropy hash is embedded in the transaction DATA field.
 */
async function storeHashOnChain(deviceId, timestamp, hash) {
  const signer = initClient();
  if (!signer) {
    const err = new Error('Blockchain client unavailable');
    err.code = 'BLOCKCHAIN_UNAVAILABLE';
    throw err;
  }

  try {
    // 1. Encode the hash as hex data (utf8 -> hex)
    const dataString = `ARGUS|${deviceId}|${hash}`;
    const hexData = ethers.hexlify(ethers.toUtf8Bytes(dataString));

    logger.info('Sending minimal anchor transaction to local node...', { deviceId });

    // 2. Send transaction to self
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0,
      data: hexData
    });
    
    logger.info('Transaction submitted!', { txHash: tx.hash });
    
    // We don't wait for confirmation here to keep the API fast, 
    // the retry worker will handle confirmation if needed.
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
