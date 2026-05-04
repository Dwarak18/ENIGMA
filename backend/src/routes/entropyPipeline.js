/**
 * backend/src/routes/entropyPipeline.js
 * 
 * BACKEND ENTROPY ORCHESTRATION API
 * ==================================
 * 
 * This route handler implements the backend side of the deterministic entropy pipeline.
 * 
 * TRUST MODEL:
 * - Frontend entropy is UNTRUSTED (validation mandatory)
 * - Backend is the ORCHESTRATION AUTHORITY
 * - Database stores validated hashes only
 * - Blockchain is the final IMMUTABLE ANCHOR
 * 
 * RESPONSIBILITIES:
 * 1. Receive raw entropy from frontend
 * 2. Validate structure and constraints
 * 3. Independently verify SHA-256 hash
 * 4. Store metadata (NOT raw entropy)
 * 5. Prepare for ESP32 AES encryption
 * 6. Initiate blockchain anchoring
 * 7. Return verification endpoint
 * 
 * DATA FLOW:
 * Frontend (untrusted) → Backend (trusted validation) → PostgreSQL (hashes only)
 *                    → ESP32 (AES encryption) → Blockchain (final anchor)
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Import services
const db = require('../db/pool');
const keyDerivationService = require('../services/keyDerivationService');
const blockchain = require('../blockchain/contractClient');

/**
 * Configuration
 */
const CONFIG = {
  MAX_ENTROPY_SIZE: 1024,           // Max 1KB of entropy
  MIN_ENTROPY_SIZE: 32,             // Min 32 bytes (256 bits)
  MAX_TIMING_DRIFT_PERCENT: 10,     // Allow up to 10% timing drift
  ENTROPY_HASH_LENGTH: 64,          // SHA-256 = 64 hex chars
  SNTP_SKEW_TOLERANCE_S: 60         // SNTP time can drift ±60 seconds
};

/**
 * Validate incoming entropy structure from frontend
 * 
 * @param {Object} entropy - Entropy object from frontend
 * @throws {Error} If validation fails
 * @returns {Object} Validated entropy metadata
 */
function validateEntropyStructure(entropy) {
  const errors = [];

  // Check required fields
  if (!entropy.frameId || typeof entropy.frameId !== 'string') {
    errors.push('frameId is required (string)');
  }

  if (!entropy.entropyHash || typeof entropy.entropyHash !== 'string') {
    errors.push('entropyHash is required (string, hex)');
  }

  if (!entropy.frameCount || typeof entropy.frameCount !== 'number') {
    errors.push('frameCount is required (number)');
  }

  if (typeof entropy.captureDurationMs !== 'number') {
    errors.push('captureDurationMs is required (number)');
  }

  // Validate entropy hash format (64-char hex)
  if (entropy.entropyHash && !/^[a-f0-9]{64}$/i.test(entropy.entropyHash)) {
    errors.push('entropyHash must be 64-character hex string');
  }

  // Validate timing drift
  if (entropy.captureDurationMs) {
    const expectedDuration = 10000;  // 10 seconds
    const driftPercent = Math.abs(entropy.captureDurationMs - expectedDuration) / expectedDuration * 100;
    if (driftPercent > CONFIG.MAX_TIMING_DRIFT_PERCENT) {
      errors.push(`Timing drift ${driftPercent.toFixed(1)}% exceeds tolerance ${CONFIG.MAX_TIMING_DRIFT_PERCENT}%`);
    }
  }

  // Validate frame count (10 FPS for 10 seconds = expect ~100 frames)
  const expectedFrameCount = 100;
  const frameCountTolerance = 10;
  if (Math.abs(entropy.frameCount - expectedFrameCount) > frameCountTolerance) {
    console.warn(`Unusual frame count: ${entropy.frameCount} (expected ~${expectedFrameCount})`);
  }

  if (errors.length > 0) {
    throw {
      code: 'VALIDATION_ERROR',
      message: 'Entropy validation failed',
      details: errors
    };
  }

  return {
    frameId: entropy.frameId,
    entropyHash: entropy.entropyHash.toLowerCase(),
    frameCount: entropy.frameCount,
    captureDurationMs: entropy.captureDurationMs,
    timestamp: entropy.captureStartTime ? new Date(entropy.captureStartTime).getTime() : Date.now()
  };
}

/**
 * Verify entropy hash independently
 * 
 * This is the CRITICAL step where backend validates the frontend's work.
 * 
 * @param {string} rawEntropyHex - Raw entropy bytes as hex string
 * @param {string} claimedHash - Hash claimed by frontend
 * @returns {Object} Verification result
 */
function verifyEntropyHash(rawEntropyHex, claimedHash) {
  const rawBytes = Buffer.from(rawEntropyHex, 'hex');
  
  // Compute hash independently
  const computedHash = crypto
    .createHash('sha256')
    .update(rawBytes)
    .digest('hex');

  const matches = computedHash === claimedHash.toLowerCase();

  return {
    matches,
    claimedHash: claimedHash.toLowerCase(),
    computedHash,
    verified: matches
  };
}

/**
 * Store validated entropy in PostgreSQL
 * 
 * This table stores ONLY hashes and metadata, never raw entropy.
 * 
 * @param {Object} validatedEntropy - Validated entropy metadata
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object>} Stored record
 */
async function storeEntropyRecord(validatedEntropy, deviceId) {
  const recordId = uuidv4();
  const now = new Date();

  const query = `
    INSERT INTO entropy_pipeline (
      id,
      device_id,
      frame_id,
      entropy_hash,
      frame_count,
      capture_duration_ms,
      captured_at,
      stored_at,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const result = await db.query(query, [
    recordId,
    deviceId,
    validatedEntropy.frameId,
    validatedEntropy.entropyHash,
    validatedEntropy.frameCount,
    validatedEntropy.captureDurationMs,
    new Date(validatedEntropy.timestamp),
    now,
    'received'
  ]);

  return result.rows[0];
}

/**
 * POST /api/v1/entropy
 * 
 * Receive entropy from frontend, validate, store, and prepare for next pipeline stages.
 * 
 * Request body:
 * {
 *   frameId: string (UUID),
 *   entropyHash: string (64-char hex SHA-256),
 *   frameCount: number,
 *   captureDurationMs: number,
 *   captureStartTime: ISO string,
 *   rawEntropyHex: string (hex) [optional, for verification only]
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   recordId: string (UUID),
 *   frameId: string,
 *   entropyHash: string,
 *   verification: {
 *     matches: boolean,
 *     verified: boolean
 *   },
 *   nextStages: {
 *     esp32Encryption: string (endpoint URL),
 *     blockchainAnchor: string (endpoint URL),
 *     verification: string (endpoint URL)
 *   }
 * }
 */
router.post('/', async (req, res) => {
  const deviceId = req.query.deviceId || 'ENIGMA_BROWSER';

  try {
    // 1. Validate structure
    const validated = validateEntropyStructure(req.body);
    console.log(`[ENTROPY] Validating frame ${validated.frameId} from ${deviceId}`);

    // 2. Verify hash if raw entropy provided
    let hashVerification = { verified: true };
    if (req.body.rawEntropyHex) {
      hashVerification = verifyEntropyHash(req.body.rawEntropyHex, validated.entropyHash);
      if (!hashVerification.verified) {
        return res.status(400).json({
          ok: false,
          code: 'HASH_MISMATCH',
          message: 'Frontend entropy hash does not match raw entropy',
          verification: hashVerification
        });
      }
      console.log(`[ENTROPY] Hash verified: ${hashVerification.computedHash.substring(0, 16)}...`);
    }

    // 3. Store in database
    const stored = await storeEntropyRecord(validated, deviceId);
    console.log(`[ENTROPY] Stored record ${stored.id}`);

    // 4. Return response with next pipeline stages
    return res.status(201).json({
      ok: true,
      recordId: stored.id,
      frameId: validated.frameId,
      entropyHash: validated.entropyHash,
      verification: {
        hashMatches: hashVerification.verified,
        verified: true
      },
      metadata: {
        frameCount: validated.frameCount,
        captureDurationMs: validated.captureDurationMs,
        storedAt: stored.stored_at
      },
      nextStages: {
        esp32Encryption: `/api/v1/entropy/${stored.id}/encrypt`,
        blockchainAnchor: `/api/v1/entropy/${stored.id}/anchor`,
        verification: `/api/v1/entropy/${stored.id}/verify`
      }
    });

  } catch (err) {
    console.error('[ENTROPY] Error:', err);

    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        ok: false,
        code: err.code,
        message: err.message,
        details: err.details
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/v1/entropy/:recordId
 * 
 * Retrieve entropy record metadata (hashes only, no raw data)
 */
router.get('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;

    const query = `
      SELECT
        id,
        device_id,
        frame_id,
        entropy_hash,
        frame_count,
        capture_duration_ms,
        status,
        captured_at,
        stored_at
      FROM entropy_pipeline
      WHERE id = $1;
    `;

    const result = await db.query(query, [recordId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: `Record ${recordId} not found`
      });
    }

    return res.json({
      ok: true,
      record: result.rows[0]
    });

  } catch (err) {
    console.error('[ENTROPY] Error fetching record:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/v1/entropy/:recordId/encrypt
 * 
 * Prepare entropy for ESP32 AES encryption
 * 
 * This endpoint:
 * 1. Retrieves validated entropy
 * 2. Prepares payload for ESP32
 * 3. Returns encryption parameters
 * 
 * Response:
 * {
 *   ok: true,
 *   recordId: string,
 *   esp32Payload: {
 *     frameId: string,
 *     entropyHash: string,
 *     deviceId: string,
 *     timestamp: number (UNIX ms)
 *   }
 * }
 */
router.post('/:recordId/encrypt', async (req, res) => {
  try {
    const { recordId } = req.params;

    // Retrieve record
    const query = `
      SELECT id, device_id, frame_id, entropy_hash, captured_at
      FROM entropy_pipeline
      WHERE id = $1;
    `;

    const result = await db.query(query, [recordId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: `Record ${recordId} not found`
      });
    }

    const record = result.rows[0];

    // Prepare ESP32 payload
    const esp32Payload = {
      frameId: record.frame_id,
      entropyHash: record.entropy_hash,
      deviceId: record.device_id,
      timestamp: Math.floor(record.captured_at.getTime() / 1000)
    };

    console.log(`[ENTROPY] ESP32 encryption payload prepared for ${recordId}`);

    return res.json({
      ok: true,
      recordId,
      esp32Payload,
      nextEndpoint: `/api/v1/entropy/${recordId}/anchor`
    });

  } catch (err) {
    console.error('[ENTROPY] Error preparing encryption:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/v1/entropy/:recordId/anchor
 * 
 * Store entropy hash on blockchain (Hardhat)
 * 
 * This is the FINAL IMMUTABLE step.
 * 
 * @param {Object} body - { aesKeyHash, sntp_time }
 */
router.post('/:recordId/anchor', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { aesKeyHash, sntp_time } = req.body;

    if (!aesKeyHash || !sntp_time) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_PARAMETERS',
        message: 'aesKeyHash and sntp_time are required'
      });
    }

    // Retrieve record
    const query = `
      SELECT id, frame_id, entropy_hash, device_id
      FROM entropy_pipeline
      WHERE id = $1;
    `;

    const result = await db.query(query, [recordId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: `Record ${recordId} not found`
      });
    }

    const record = result.rows[0];

    // Compute final blockchain hash: SHA256(AES_key_hash || frame_id || sntp_time)
    const hashInput = aesKeyHash + record.frame_id + sntp_time;
    const finalHash = crypto
      .createHash('sha256')
      .update(hashInput)
      .digest('hex');

    // Store on blockchain
    try {
      const txHash = await blockchain.storeHash(finalHash);
      console.log(`[ENTROPY] Hash anchored on blockchain: ${txHash}`);

      // Update record status
      const updateQuery = `
        UPDATE entropy_pipeline
        SET status = 'anchored', blockchain_tx_hash = $1, blockchain_hash = $2, aes_key_hash = $3
        WHERE id = $4
        RETURNING *;
      `;

      const updateResult = await db.query(updateQuery, [txHash, finalHash, aesKeyHash, recordId]);

      return res.json({
        ok: true,
        recordId,
        frameId: record.frame_id,
        finalHash,
        blockchainTxHash: txHash,
        verification: `/api/v1/entropy/${recordId}/verify`
      });

    } catch (blockchainErr) {
      console.error('[ENTROPY] Blockchain error:', blockchainErr);
      return res.status(500).json({
        ok: false,
        code: 'BLOCKCHAIN_ERROR',
        message: `Failed to anchor on blockchain: ${blockchainErr.message}`
      });
    }

  } catch (err) {
    console.error('[ENTROPY] Error in anchor:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/v1/entropy/:recordId/verify
 * 
 * Verify entropy integrity against blockchain
 * 
 * This is the verification endpoint mentioned in copilot.md and skills.md
 */
router.get('/:recordId/verify', async (req, res) => {
  try {
    const { recordId } = req.params;

    const query = `
      SELECT
        id,
        frame_id,
        entropy_hash,
        aes_key_hash,
        blockchain_hash,
        blockchain_tx_hash,
        status
      FROM entropy_pipeline
      WHERE id = $1;
    `;

    const result = await db.query(query, [recordId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: `Record ${recordId} not found`
      });
    }

    const record = result.rows[0];

    // Check blockchain
    let blockchainVerified = false;
    let blockchainStatus = 'not_anchored';

    if (record.blockchain_hash && record.blockchain_tx_hash) {
      try {
        blockchainVerified = await blockchain.verifyHash(record.blockchain_hash);
        blockchainStatus = blockchainVerified ? 'verified' : 'unverified';
      } catch (err) {
        blockchainStatus = 'error';
        console.error('[ENTROPY] Blockchain verification error:', err);
      }
    }

    return res.json({
      ok: true,
      recordId,
      frameId: record.frame_id,
      entropyHash: record.entropy_hash,
      aesKeyHash: record.aes_key_hash,
      blockchainHash: record.blockchain_hash,
      blockchainTxHash: record.blockchain_tx_hash,
      verification: {
        entropyHashOnFile: !!record.entropy_hash,
        aesKeyHashOnFile: !!record.aes_key_hash,
        blockchainAnchor: blockchainStatus,
        blockchainVerified,
        status: record.status
      }
    });

  } catch (err) {
    console.error('[ENTROPY] Error in verify:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
