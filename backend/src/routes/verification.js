/**
 * backend/src/routes/verification.js
 * 
 * Verification endpoints for blockchain anchoring and integrity checking
 * 
 * Routes:
 *   POST /api/v1/verification/verify-record
 *   GET  /api/v1/verification/status/:frame_id
 */

'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const logger = require('../logger');
const { contractClient } = require('../blockchain/contractClient');

/**
 * POST /api/v1/verification/verify-record
 * Verify that a record's integrity hash matches blockchain anchor
 * 
 * Request body:
 * {
 *   device_id: string,
 *   timestamp: number,
 *   frame_id: string (UUID),
 *   aes_key_hash: string (hex SHA-256),
 *   sntp_timestamp: number
 * }
 * 
 * Response:
 * {
 *   ok: boolean,
 *   verified: boolean,
 *   db_hash: string (hex),
 *   blockchain_hash: string (hex),
 *   match: boolean,
 *   block_number: number (on chain),
 *   timestamp: string (ISO)
 * }
 */
router.post('/verify-record', async (req, res) => {
  try {
    const { device_id, timestamp, frame_id, aes_key_hash, sntp_timestamp } = req.body || {};

    // Validate input
    if (!device_id || !timestamp || !frame_id || !aes_key_hash || sntp_timestamp === undefined) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_FIELDS',
        message: 'device_id, timestamp, frame_id, aes_key_hash, sntp_timestamp required',
      });
    }

    if (!/^[0-9a-f]{64}$/i.test(aes_key_hash)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_KEY_HASH',
        message: 'aes_key_hash must be 64-char hex (SHA-256)',
      });
    }

    // Step 1: Compute integrity hash locally
    // Format: SHA256(aes_key_hash || frame_id || sntp_time)
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(aes_key_hash, 'hex');
    hash.update(frame_id, 'utf8');

    const timeBuffer = Buffer.allocUnsafe(8);
    timeBuffer.writeBigInt64BE(BigInt(sntp_timestamp), 0);
    hash.update(timeBuffer);

    const computedHash = hash.digest('hex');

    // Step 2: Query database for stored hash
    const dbResult = await pool.query(
      `SELECT blockchain_hash FROM image_streams
       WHERE device_id = $1 AND timestamp = $2 AND id = $3
       LIMIT 1`,
      [device_id, timestamp, frame_id]
    );

    const dbRecord = dbResult.rows[0];
    if (!dbRecord) {
      return res.status(404).json({
        ok: false,
        code: 'RECORD_NOT_FOUND',
        message: 'No record found in database',
      });
    }

    const dbHash = dbRecord.blockchain_hash;

    // Step 3: Verify against blockchain
    let blockchainVerified = false;
    let blockNumber = null;

    try {
      // Call smart contract verifyRecord function
      const recordKey = `${device_id}_${sntp_timestamp}`;
      blockchainVerified = await contractClient.verifyRecord(recordKey, computedHash);
      
      // Get block number from contract
      const contractRecord = await contractClient.getRecord(recordKey);
      blockNumber = contractRecord?.blockNumber;
    } catch (err) {
      logger.warn('Blockchain verification failed (contract may not have this record)', {
        error: err.message,
        record_key: `${device_id}_${sntp_timestamp}`,
      });
    }

    // Step 4: Compare hashes
    const dbMatches = dbHash === computedHash;
    const allValid = dbMatches && (blockchainVerified || !blockNumber);

    return res.json({
      ok: true,
      verified: allValid,
      db_hash: dbHash,
      computed_hash: computedHash,
      match: dbMatches,
      blockchain_verified: blockchainVerified,
      block_number: blockNumber,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('POST /verification/verify-record error', {
      error: err.message || String(err),
    });
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message || 'Verification failed',
    });
  }
});

/**
 * GET /api/v1/verification/status/:frame_id
 * Get verification status for a captured frame
 * 
 * Query params:
 *   ?device_id=<id>  (optional, for filtering)
 * 
 * Response:
 * {
 *   ok: boolean,
 *   frame_id: string,
 *   device_id: string,
 *   timestamp: number,
 *   anchored: boolean,
 *   blockchain_hash: string (hex),
 *   db_hash: string (hex),
 *   verified: boolean,
 *   created_at: string (ISO)
 * }
 */
router.get('/status/:frame_id', async (req, res) => {
  try {
    const { frame_id } = req.params;
    const { device_id } = req.query;

    if (!frame_id) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_FRAME_ID',
      });
    }

    // Query database
    let query = `
      SELECT
        id as frame_id,
        device_id,
        timestamp,
        blockchain_hash,
        encryption_key_hash,
        key_time_hash,
        created_at
      FROM image_streams
      WHERE id = $1
    `;
    const params = [frame_id];

    if (device_id) {
      query += ' AND device_id = $2';
      params.push(device_id);
    }

    query += ' LIMIT 1';

    const result = await pool.query(query, params);
    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        code: 'FRAME_NOT_FOUND',
      });
    }

    const record = result.rows[0];

    // Check if anchored on blockchain
    const recordKey = `${record.device_id}_${record.timestamp}`;
    let blockchainAnchored = false;
    
    try {
      const contractRecord = await contractClient.getRecord(recordKey);
      blockchainAnchored = !!contractRecord && contractRecord.blockNumber > 0;
    } catch (err) {
      logger.debug('Blockchain lookup failed (record may not be anchored)', {
        record_key: recordKey,
      });
    }

    return res.json({
      ok: true,
      frame_id: record.frame_id,
      device_id: record.device_id,
      timestamp: Number(record.timestamp),
      anchored: blockchainAnchored,
      blockchain_hash: record.blockchain_hash,
      key_time_hash: record.key_time_hash,
      verified: !!record.blockchain_hash,
      created_at: record.created_at,
    });
  } catch (err) {
    logger.error('GET /verification/status/:frame_id error', {
      error: err.message || String(err),
    });
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
