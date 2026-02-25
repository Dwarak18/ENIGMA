/**
 * src/services/entropyService.js
 * Business logic: validate, verify, persist, and broadcast entropy records.
 */
'use strict';

const pool           = require('../db/pool');
const { verifySignature } = require('./verifier');
const logger         = require('../logger');
const config         = require('../config');

/* ── Device public-key cache ──────────────────────────────────────────
 * Avoids a DB round-trip on every request for known devices.
 * Structure: Map<device_id, public_key_hex>
 */
const deviceKeyCache = new Map();

/** @type {import('socket.io').Server|null} */
let _io = null;

/**
 * Inject Socket.IO server reference (called once from src/index.js).
 * @param {import('socket.io').Server} io
 */
function setIO(io) {
  _io = io;
}

/**
 * Retrieve or cache the public key for a device.
 * If a new key is provided in the payload, it is upserted to the devices table.
 *
 * @param {string} deviceId
 * @param {string|undefined} payloadPubkey  – hex string from request body (optional)
 * @returns {Promise<string|null>} stored public key hex, or null if not found
 */
async function resolvePublicKey(deviceId, payloadPubkey) {
  /* 1. Memory cache hit */
  if (deviceKeyCache.has(deviceId)) {
    return deviceKeyCache.get(deviceId);
  }

  /* 2. Payload includes key → upsert to DB and cache */
  if (payloadPubkey) {
    await pool.query(`
      INSERT INTO devices (device_id, public_key, first_seen, last_seen)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (device_id)
      DO UPDATE SET public_key = $2, last_seen = NOW()
    `, [deviceId, payloadPubkey]);

    deviceKeyCache.set(deviceId, payloadPubkey);
    logger.info('Device registered/updated', { deviceId });
    return payloadPubkey;
  }

  /* 3. Look up in DB */
  const res = await pool.query(
    'SELECT public_key FROM devices WHERE device_id = $1', [deviceId]);
  if (res.rows.length === 0) return null;

  const key = res.rows[0].public_key;
  deviceKeyCache.set(deviceId, key);
  return key;
}

/**
 * Process an incoming entropy submission.
 *
 * @throws {Error} with .statusCode and .code set for structured error responses
 * @returns {Promise<Object>} the stored record
 */
async function processEntropy(payload) {
  const {
    device_id,
    timestamp,
    entropy_hash,
    signature,
    public_key,
  } = payload;

  /* ── Timestamp freshness check ──────────────────────────────────── */
  const serverNow = Math.floor(Date.now() / 1000);
  const skew      = Math.abs(serverNow - timestamp);
  if (skew > config.security.maxTimestampSkewSeconds) {
    logger.warn('Stale timestamp rejected', { device_id, timestamp, skew });
    const err = new Error(`Timestamp is ${skew}s old (max ${config.security.maxTimestampSkewSeconds}s)`);
    err.statusCode = 400;
    err.code = 'STALE_TIMESTAMP';
    throw err;
  }

  /* ── Resolve public key ─────────────────────────────────────────── */
  const pubkey = await resolvePublicKey(device_id, public_key);
  if (!pubkey) {
    logger.warn('Unknown device – no public key available', { device_id });
    const err = new Error('Device not registered and no public_key provided');
    err.statusCode = 400;
    err.code = 'UNKNOWN_DEVICE';
    throw err;
  }

  /* ── Signature verification ─────────────────────────────────────── */
  const valid = verifySignature(pubkey, entropy_hash, signature);
  if (!valid) {
    logger.warn('Signature verification FAILED', { device_id });
    const err = new Error('Signature verification failed');
    err.statusCode = 400;
    err.code = 'INVALID_SIGNATURE';
    throw err;
  }

  logger.info('Signature verified', { device_id });

  /* ── Persist to DB (replay guard via unique index) ──────────────── */
  let record;
  try {
    const res = await pool.query(`
      INSERT INTO entropy_records (device_id, timestamp, entropy_hash, signature)
      VALUES ($1, $2, $3, $4)
      RETURNING id, device_id, timestamp, entropy_hash, signature, created_at
    `, [device_id, timestamp, entropy_hash, signature]);
    record = res.rows[0];
  } catch (dbErr) {
    if (dbErr.code === '23505') {   /* unique_violation */
      logger.warn('Replay attack detected', { device_id, timestamp, entropy_hash });
      const err = new Error('Duplicate record – replay attack detected');
      err.statusCode = 409;
      err.code = 'REPLAY_DETECTED';
      throw err;
    }
    throw dbErr;
  }

  /* Update device last_seen */
  await pool.query(
    'UPDATE devices SET last_seen = NOW() WHERE device_id = $1',
    [device_id]
  );

  /* ── Broadcast via WebSocket ────────────────────────────────────── */
  if (_io) {
    _io.emit('entropy:new', {
      id:           record.id,
      device_id:    record.device_id,
      timestamp:    Number(record.timestamp),
      entropy_hash: record.entropy_hash,
      signature:    record.signature,
      created_at:   record.created_at,
      verified:     true,
    });
  }

  logger.info('Entropy record stored and broadcast', { id: record.id, device_id });
  return record;
}

/**
 * Fetch the latest N records.
 */
async function getLatest(limit = 1) {
  const res = await pool.query(`
    SELECT id, device_id, timestamp, entropy_hash, signature, created_at
    FROM entropy_records
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
  return limit === 1 ? res.rows[0] || null : res.rows;
}

/**
 * Fetch history with pagination.
 */
async function getHistory(limit = 100) {
  const res = await pool.query(`
    SELECT id, device_id, timestamp, entropy_hash, signature, created_at
    FROM entropy_records
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(limit, 1000)]);
  return res.rows;
}

module.exports = { processEntropy, getLatest, getHistory, setIO };
