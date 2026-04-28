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

/* ── Device presence watchdog ─────────────────────────────────────────
 * Tracks live online/offline state per device.
 * On each entropy POST the watchdog timer is reset.
 * After DEVICE_WATCHDOG_MS with no new post the device is considered
 * offline and a `device:status` event is broadcast to all WS clients.
 */
const DEVICE_WATCHDOG_MS = 15_000;   // 1.5× the 10s posting interval
const _deviceTimers = new Map();     // device_id → NodeJS.Timeout
const _deviceOnline = new Map();     // device_id → boolean

/* ── TRNG pipeline state machine ──────────────────────────────────────────
 * inactive  – no device has come online since backend start
 * active    – a verified device is online and emitting entropy
 * suspended – device was active but disconnected; pipeline frozen
 * ───────────────────────────────────────────────────────────────────────── */
const TRNG_STATE = Object.freeze({
  INACTIVE:  'inactive',
  ACTIVE:    'active',
  SUSPENDED: 'suspended',
});

const _trngByDevice = new Map();   // device_id → TRNG_STATE value

function _setTRNG(device_id, newState) {
  const prev = _trngByDevice.get(device_id) || TRNG_STATE.INACTIVE;
  if (prev === newState) return;
  _trngByDevice.set(device_id, newState);
  logger.info('TRNG state change', { device_id, from: prev, to: newState });
  if (_io) {
    _io.emit('trng:state', { device_id, state: newState, ts: Date.now() });
  }
}

function getTRNGStatus() {
  const pipeline = Array.from(_trngByDevice.entries())
    .map(([device_id, state]) => ({ device_id, state }));
  const overall = pipeline.some(d => d.state === TRNG_STATE.ACTIVE)
    ? TRNG_STATE.ACTIVE
    : pipeline.some(d => d.state === TRNG_STATE.SUSPENDED)
      ? TRNG_STATE.SUSPENDED
      : TRNG_STATE.INACTIVE;
  return { state: overall, pipeline, ts: Date.now() };
}

function _emitDeviceStatus(device_id, online, last_seen, rtc_time) {
  // Mirror device online state into the TRNG pipeline state machine
  if (online) {
    _setTRNG(device_id, TRNG_STATE.ACTIVE);
  } else {
    const prev = _trngByDevice.get(device_id) || TRNG_STATE.INACTIVE;
    // Only advance inactive→suspended when there was previously an active state
    _setTRNG(device_id, prev === TRNG_STATE.ACTIVE ? TRNG_STATE.SUSPENDED : prev);
  }

  if (_io) {
    _io.emit('device:status', {
      device_id,
      online,
      last_seen: last_seen || null,
      rtc_time:  rtc_time  || null,
      ts: Date.now(),
    });
  }
}

function _trackDeviceHeartbeat(device_id, last_seen, rtc_time) {
  _deviceOnline.set(device_id, true);

  // Reset the watchdog
  if (_deviceTimers.has(device_id)) clearTimeout(_deviceTimers.get(device_id));

  const timer = setTimeout(() => {
    _deviceOnline.set(device_id, false);
    _deviceTimers.delete(device_id);
    logger.info('Device went offline (watchdog timeout)', { device_id });
    _emitDeviceStatus(device_id, false, null, null);
  }, DEVICE_WATCHDOG_MS);

  _deviceTimers.set(device_id, timer);

  // Always emit heartbeat so frontend refreshes last_seen + rtc_time
  _emitDeviceStatus(device_id, true, last_seen, rtc_time || null);
}

/**
 * Snapshot of current device online states.
 * Used by WebSocket on-connect to sync new clients.
 */
function getDeviceStatuses() {
  return Array.from(_deviceOnline.entries()).map(([device_id, online]) => ({
    device_id,
    online,
  }));
}

/**
 * Immediately force a device online or offline.
 * Called by the COM port monitor (external signal) via POST /api/v1/system/device-status.
 * Resets / clears the watchdog timer accordingly.
 *
 * @param {string} device_id
 * @param {boolean} online
 * @param {string|null} [com_port] optional COM port label for logging
 * @param {string|null} [rtc_time] optional RTC time string from firmware ("HH:MM:SS")
 */
function forceDeviceStatus(device_id, online, com_port, rtc_time) {
  // Clear any existing watchdog
  if (_deviceTimers.has(device_id)) {
    clearTimeout(_deviceTimers.get(device_id));
    _deviceTimers.delete(device_id);
  }

  _deviceOnline.set(device_id, online);

  logger.info(
    online ? 'COM monitor: device connected' : 'COM monitor: device disconnected',
    { device_id, com_port: com_port || 'unknown', rtc_time: rtc_time || null }
  );

  // Emit immediately — include rtc_time so the frontend can display it
  _emitDeviceStatus(device_id, online, null, rtc_time || null);

  // If forced online, arm the watchdog so it auto-expires if firmware never posts
  if (online) {
    const timer = setTimeout(() => {
      _deviceOnline.set(device_id, false);
      _deviceTimers.delete(device_id);
      logger.info('Device watchdog expired after COM-online signal', { device_id });
      _emitDeviceStatus(device_id, false, null, null);
    }, DEVICE_WATCHDOG_MS);
    _deviceTimers.set(device_id, timer);
  }
}

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
    rtc_time,
    aes_ciphertext,
    aes_iv,
    image_encrypted,
    image_iv,
    image_hash,
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
      INSERT INTO entropy_records (device_id, timestamp, entropy_hash, signature, aes_ciphertext, aes_iv, rtc_time, image_encrypted, image_iv, image_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, device_id, timestamp, entropy_hash, signature, aes_ciphertext, aes_iv, rtc_time, image_encrypted, image_iv, image_hash, created_at
    `, [device_id, timestamp, entropy_hash, signature,
        aes_ciphertext || null, aes_iv || null, rtc_time || null,
        image_encrypted || null, image_iv || null, image_hash || null]);
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
      id:              record.id,
      device_id:       record.device_id,
      timestamp:       Number(record.timestamp),
      entropy_hash:    record.entropy_hash,
      signature:       record.signature,
      aes_ciphertext:  record.aes_ciphertext || null,
      aes_iv:          record.aes_iv         || null,
      rtc_time:        record.rtc_time        || null,
      image_encrypted: record.image_encrypted || null,
      image_iv:        record.image_iv        || null,
      image_hash:      record.image_hash      || null,
      created_at:      record.created_at,
      verified:        true,
    });
  }

  logger.info('Entropy record stored and broadcast', { id: record.id, device_id });

  // ── Device presence heartbeat ──────────────────────────────────────
  _trackDeviceHeartbeat(device_id, record.created_at, rtc_time || null);

  return record;
}

/**
 * Fetch the latest N records.
 */
async function getLatest(limit = 1) {
  const res = await pool.query(`
    SELECT id, device_id, timestamp, entropy_hash, signature,
           aes_ciphertext, aes_iv, rtc_time,
           image_encrypted, image_iv, image_hash,
           created_at
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
    SELECT id, device_id, timestamp, entropy_hash, signature,
           aes_ciphertext, aes_iv, rtc_time,
           image_encrypted, image_iv, image_hash,
           created_at
    FROM entropy_records
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(limit, 1000)]);
  return res.rows;
}

/**
 * Fetch a single record by ID.
 */
async function getRecordById(id) {
  const res = await pool.query(`
    SELECT id, device_id, timestamp, entropy_hash, signature,
           aes_ciphertext, aes_iv, rtc_time,
           image_encrypted, image_iv, image_hash,
           created_at
    FROM entropy_records
    WHERE id = $1
  `, [id]);
  return res.rows[0] || null;
}

/**
 * Fetch a single record by ID (UUID) or Entropy Hash.
 * Supports partial matches (prefixes) for convenience.
 */
async function getRecordByAny(identifier) {
  if (!identifier) return null;
  const cleanId = identifier.trim().toLowerCase();
  
  // 1. Try exact UUID match
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (isUuid) {
    const res = await pool.query('SELECT * FROM entropy_records WHERE id = $1', [cleanId]);
    if (res.rows[0]) return res.rows[0];
  }

  // 2. Try exact Hash match
  const resHash = await pool.query('SELECT * FROM entropy_records WHERE entropy_hash = $1', [cleanId]);
  if (resHash.rows[0]) return resHash.rows[0];

  // 3. Try prefix match (first 8+ chars)
  if (cleanId.length >= 8) {
    const resPrefix = await pool.query(`
      SELECT * FROM entropy_records 
      WHERE id::text LIKE $1 || '%' 
         OR entropy_hash LIKE $1 || '%'
      ORDER BY created_at DESC
      LIMIT 1
    `, [cleanId]);
    return resPrefix.rows[0] || null;
  }

  return null;
}

module.exports = { processEntropy, getLatest, getHistory, setIO, getDeviceStatuses, forceDeviceStatus, getTRNGStatus, getRecordById, getRecordByAny };


