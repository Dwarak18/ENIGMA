/**
 * src/services/blockchainAgent.js
 * Optional autonomous blockchain agent for image proof records.
 */
'use strict';

const { ethers } = require('ethers');
const pool = require('../db/pool');
const logger = require('../logger');
const config = require('../config');

const ABI = [
  'function storeProof(bytes32 imageHash, string calldata ipfsCid) external',
  'function proofExists(bytes32 imageHash) external view returns (bool)',
];

let provider = null;
let contract = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
  }
  return provider;
}

function getContract() {
  if (!contract) {
    const signer = new ethers.Wallet(config.blockchain.privateKey, getProvider());
    contract = new ethers.Contract(config.blockchain.contractAddress, ABI, signer);
  }
  return contract;
}

async function imageProofsTableExists() {
  const result = await pool.query(`SELECT to_regclass('public.image_proofs') AS table_name`);
  return Boolean(result.rows[0]?.table_name);
}

async function fetchPendingRecords() {
  if (!(await imageProofsTableExists())) return [];
  const result = await pool.query(`
    SELECT id, image_hash, ipfs_cid
    FROM image_proofs
    WHERE status IN ('pending', 'uploaded')
      AND tx_hash IS NULL
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at ASC
    LIMIT 10
  `);
  return result.rows;
}

async function fetchUnconfirmedRecords() {
  if (!(await imageProofsTableExists())) return [];
  const result = await pool.query(`
    SELECT id, image_hash, tx_hash
    FROM image_proofs
    WHERE status = 'submitted'
      AND tx_hash IS NOT NULL
      AND created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at ASC
    LIMIT 20
  `);
  return result.rows;
}

async function submitProofTransaction(imageHashHex, ipfsCid) {
  const activeContract = getContract();
  const hashBytes32 = `0x${imageHashHex}`;

  try {
    const exists = await activeContract.proofExists(hashBytes32);
    if (exists) {
      logger.warn(`[AGENT] Hash already on-chain, skipping: ${imageHashHex}`);
      return { alreadyExists: true, txHash: null };
    }
  } catch (err) {
    logger.warn(`[AGENT] proofExists check failed: ${err.message}`);
  }

  const tx = await activeContract.storeProof(hashBytes32, ipfsCid || '', {
    gasLimit: 120000,
  });

  logger.info(`[AGENT] Tx submitted: ${tx.hash} for hash: ${imageHashHex}`);
  return { alreadyExists: false, txHash: tx.hash };
}

async function markAsSubmitted(recordId, txHash) {
  await pool.query(
    `UPDATE image_proofs SET tx_hash = $1, status = 'submitted' WHERE id = $2`,
    [txHash, recordId]
  );
}

async function markAsConfirmed(recordId, blockNumber) {
  await pool.query(
    `UPDATE image_proofs SET status = 'confirmed', tx_confirmed_block = $1 WHERE id = $2`,
    [blockNumber, recordId]
  );
}

async function markAsFailed(recordId, reason) {
  await pool.query(
    `UPDATE image_proofs SET status = 'failed', failure_reason = $1 WHERE id = $2`,
    [reason, recordId]
  );
}

async function runSubmissionCycle() {
  const records = await fetchPendingRecords();
  for (const record of records) {
    try {
      const { alreadyExists, txHash } = await submitProofTransaction(
        record.image_hash,
        record.ipfs_cid
      );

      if (alreadyExists) {
        await pool.query(`UPDATE image_proofs SET status = 'confirmed' WHERE id = $1`, [record.id]);
      } else {
        await markAsSubmitted(record.id, txHash);
      }
    } catch (err) {
      logger.error(`[AGENT] Submit error for id=${record.id}: ${err.message}`);
      await markAsFailed(record.id, err.message.slice(0, 200));
    }
  }
}

async function runConfirmationCycle() {
  const records = await fetchUnconfirmedRecords();
  for (const record of records) {
    try {
      const receipt = await getProvider().getTransactionReceipt(record.tx_hash);
      if (!receipt) continue;
      if (receipt.status === 0) {
        await markAsFailed(record.id, `Tx reverted on-chain: ${record.tx_hash}`);
      } else {
        await markAsConfirmed(record.id, receipt.blockNumber);
      }
    } catch (err) {
      logger.error(`[AGENT] Confirm error for id=${record.id}: ${err.message}`);
    }
  }
}

async function startBlockchainAgent() {
  if (!config.blockchain.enabled || !config.blockchain.rpcUrl) {
    logger.info('[AGENT] Blockchain agent disabled');
    return;
  }

  logger.info('[AGENT] Blockchain agent started');

  await runSubmissionCycle();
  await runConfirmationCycle();

  setInterval(() => {
    runSubmissionCycle().catch((err) => logger.error('[AGENT] Submission cycle crash', { error: err.message }));
  }, 15000);

  setInterval(() => {
    runConfirmationCycle().catch((err) => logger.error('[AGENT] Confirmation cycle crash', { error: err.message }));
  }, 30000);
}

module.exports = { startBlockchainAgent };
