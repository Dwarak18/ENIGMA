/**
 * src/services/imageStreamService.js
 * Handles real-time encrypted image streaming via WebSocket
 *
 * Features:
 *   - Chunk receipt and validation
 *   - Hash verification: SHA-256(encrypted_data + timestamp + device_id)
 *   - Chunk reassembly across device + timestamp
 *   - Broadcast to dashboard clients
 *   - Async DB persistence (non-blocking)
 */
'use strict';

const pool           = require('../db/pool');
const logger         = require('../logger');
const crypto         = require('crypto');

const PLACEHOLDER_PUBLIC_KEY = `04${'0'.repeat(128)}`;
const SERVER_IMAGE_SECRET = process.env.IMAGE_ENCRYPTION_SECRET ||
  process.env.SERVER_RANDOM_SEED ||
  'enigma-local-image-secret-change-me';

/* ── Chunk reassembly buffer ────────────────────────────────────────
 * Structure: Map<`${device_id}:${timestamp}`, { chunks, completed, timer }>
 * Holds incomplete chunk sets and auto-expires after timeout.
 */
const CHUNK_TIMEOUT_MS = 30_000;  // 30 seconds max for reassembly
const _reassemblyMap = new Map();

/**
 * Verify integrity hash of encrypted chunk
 * Must match: SHA-256(encrypted_data + timestamp + device_id)
 *
 * @param {Buffer} encryptedData Encrypted chunk bytes
 * @param {number} timestamp UNIX epoch timestamp
 * @param {string} deviceId Device identifier
 * @param {string} expectedHash Hex-encoded SHA-256 from received chunk
 * @returns {boolean} true if hash matches
 */
function verifyChunkHash(encryptedData, timestamp, deviceId, expectedHash) {
  try {
    const hash = crypto.createHash('sha256');
    
    /* Hash: encrypted_data || timestamp (8-byte big-endian) || device_id */
    hash.update(encryptedData);
    
    /* Timestamp as big-endian 64-bit integer */
    const tsBuffer = Buffer.allocUnsafe(8);
    tsBuffer.writeBigInt64BE(BigInt(timestamp), 0);
    hash.update(tsBuffer);
    
    hash.update(deviceId, 'utf8');
    
    const computedHash = hash.digest('hex');
    const match = computedHash === expectedHash.toLowerCase();
    
    if (!match) {
      logger.warn('Hash mismatch for device', {
        device_id: deviceId,
        expected: expectedHash,
        computed: computedHash,
      });
    }
    
    return match;
  } catch (err) {
    logger.error('Hash verification error', { error: err.message || String(err) });
    return false;
  }
}

/**
 * Handle incoming image chunk from ESP32
 *
 * @param {object} chunkData Parsed chunk object from WebSocket message
 * @param {string} deviceId Source device ID
 * @param {import('socket.io').Server} io Socket.IO instance for broadcasting
 */
async function processImageChunk(chunkData, deviceId, io) {
  try {
    /* ── Validate structure ──────────────────────────────────────────– */
    if (!chunkData.timestamp || chunkData.chunk_id === undefined || !chunkData.hash) {
      logger.warn('Invalid chunk structure', { device_id: deviceId });
      return;
    }
    
    /* ── Decode binary data ──────────────────────────────────────────– */
    const encryptedData = Buffer.from(chunkData.data, 'hex');
    const iv = Buffer.from(chunkData.iv, 'hex');
    
    if (encryptedData.length === 0 || iv.length !== 16) {
      logger.warn('Invalid encrypted data length', { device_id: deviceId });
      return;
    }
    
    /* ── Verify integrity hash ───────────────────────────────────────– */
    if (!verifyChunkHash(encryptedData, chunkData.timestamp, deviceId, chunkData.hash)) {
      logger.warn('Chunk hash verification failed', { device_id: deviceId });
      return;
    }
    
    /* ── Reassemble chunks if needed ─────────────────────────────────– */
    const reassemblyKey = `${deviceId}:${chunkData.timestamp}`;
    let reassembly = _reassemblyMap.get(reassemblyKey);
    
    if (!reassembly) {
      reassembly = {
        device_id: deviceId,
        timestamp: chunkData.timestamp,
        total_chunks: chunkData.total_chunks,
        chunks: new Map(),
        completed: false,
        timer: null,
      };
      
      /* Auto-expire reassembly after timeout */
      reassembly.timer = setTimeout(() => {
        _reassemblyMap.delete(reassemblyKey);
        logger.warn('Chunk reassembly timeout', { reassembly_key: reassemblyKey });
      }, CHUNK_TIMEOUT_MS);
      
      _reassemblyMap.set(reassemblyKey, reassembly);
    }
    
    /* Store chunk */
    reassembly.chunks.set(chunkData.chunk_id, {
      data: encryptedData,
      iv: iv,
      hash: chunkData.hash,
    });
    
    /* Check if all chunks received */
    if (reassembly.chunks.size === reassembly.total_chunks && !reassembly.completed) {
      reassembly.completed = true;
      clearTimeout(reassembly.timer);
      
      /* Reassemble full payload */
      const fullData = Buffer.concat(
        Array.from({ length: reassembly.total_chunks }, (_, i) =>
          reassembly.chunks.get(i).data
        )
      );
      
      logger.info('Image stream reassembled', {
        device_id: deviceId,
        timestamp: chunkData.timestamp,
        total_bytes: fullData.length,
      });
      
      /* ── Async DB persist (non-blocking) ─────────────────────────– */
      // Don't await this – let it run in background
      persistImageStream(deviceId, chunkData.timestamp, fullData, iv).catch(err => {
        logger.error('Image persistence failed', { error: err.message || String(err) });
      });
      
      /* ── Broadcast to dashboard clients ──────────────────────────– */
      if (io) {
        io.emit('image:stream', {
          device_id: deviceId,
          timestamp: chunkData.timestamp,
          size_bytes: fullData.length,
          hash: chunkData.hash,
          // For dashboard display, include base64-encoded preview if small
          preview: fullData.length <= 1024 ? fullData.toString('base64') : null,
        });
      }
      
      /* Clean up reassembly entry */
      _reassemblyMap.delete(reassemblyKey);
    } else {
      /* Still waiting for more chunks */
      logger.debug('Chunk received', {
        device_id: deviceId,
        chunk_id: chunkData.chunk_id,
        progress: `${reassembly.chunks.size}/${reassembly.total_chunks}`,
      });
    }
  } catch (err) {
    logger.error('Image chunk processing error', { error: err.message || String(err) });
  }
}

/**
 * Persist image stream to database (async, non-blocking)
 * Runs independently without blocking WebSocket broadcast
 */
async function persistImageStream(deviceId, timestamp, encryptedData, iv) {
  try {
    await pool.query(`
      INSERT INTO image_streams (device_id, timestamp, encrypted_data, iv, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (device_id, timestamp) DO UPDATE SET
        encrypted_data = EXCLUDED.encrypted_data,
        iv = EXCLUDED.iv
    `, [
      deviceId,
      timestamp,
      encryptedData.toString('hex'),
      iv.toString('hex'),
    ]);
    
    logger.debug('Image stream persisted', { device_id: deviceId, timestamp });
  } catch (err) {
    logger.warn('Image stream DB error', { error: err.message || String(err) });
    // Don't re-throw; let it fail silently so WebSocket stays responsive
  }
}

async function ensureDevice(deviceId) {
  await pool.query(`
    INSERT INTO devices (device_id, public_key, first_seen, last_seen)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (device_id)
    DO UPDATE SET last_seen = NOW()
  `, [deviceId, PLACEHOLDER_PUBLIC_KEY]);
}

function normalizeBase64Image(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    const err = new Error('image_base64 is required');
    err.statusCode = 400;
    throw err;
  }

  const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
      preview: imageBase64,
    };
  }

  return {
    mimeType: 'image/jpeg',
    base64: imageBase64,
    preview: `data:image/jpeg;base64,${imageBase64}`,
  };
}

const fs           = require('fs');
const path         = require('path');

const STORAGE_PATH = path.join(__dirname, '../../capture');
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

function encryptImageBytes(buffer, deviceId, timestamp, espTime) {
  // Use deviceId, timestamp, and espTime for entropy in key material
  const keyMaterial = `${deviceId}|${timestamp}|${espTime}|${SERVER_IMAGE_SECRET}`;
  
  // We want AES-128, so we take the first 16 bytes of the SHA-256 hash
  const fullHash = crypto.createHash('sha256').update(keyMaterial).digest();
  const key = fullHash.slice(0, 16); // 128 bits
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

  const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const encryptedHash = crypto.createHash('sha256').update(encrypted).digest('hex');
  
  // Hash the encryption key with ESP time as requested
  const keyTimeHash = crypto.createHash('sha256')
    .update(key)
    .update(String(espTime))
    .digest('hex');

  return {
    encrypted,
    iv,
    imageHash,
    encryptedHash,
    keyHash: crypto.createHash('sha256').update(key).digest('hex'),
    keyTimeHash,
  };
}

async function captureLaptopImage({ deviceId, imageBase64, espTime }) {
  const device_id = deviceId || 'esp32-001';
  const timestamp = Math.floor(Date.now() / 1000);
  const resolvedEspTime = espTime || new Date(timestamp * 1000).toISOString();
  const image = normalizeBase64Image(imageBase64);
  const imageBuffer = Buffer.from(image.base64, 'base64');

  if (imageBuffer.length === 0) {
    const err = new Error('image_base64 decoded to an empty image');
    err.statusCode = 400;
    throw err;
  }

  // Save to local folder as requested
  const filename = `${device_id}_${timestamp}.jpg`;
  const filePath = path.join(STORAGE_PATH, filename);
  fs.writeFileSync(filePath, imageBuffer);
  logger.info('Image saved to local storage', { path: filePath });

  await ensureDevice(device_id);

  const encrypted = encryptImageBytes(imageBuffer, device_id, timestamp, resolvedEspTime);

  const res = await pool.query(`
    INSERT INTO image_streams (
      device_id,
      timestamp,
      encrypted_data,
      iv,
      image_hash,
      encrypted_hash,
      encryption_key_hash,
      key_time_hash,
      image_preview,
      byte_size,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (device_id, timestamp)
    DO UPDATE SET
      encrypted_data = EXCLUDED.encrypted_data,
      iv = EXCLUDED.iv,
      image_hash = EXCLUDED.image_hash,
      encrypted_hash = EXCLUDED.encrypted_hash,
      encryption_key_hash = EXCLUDED.encryption_key_hash,
      key_time_hash = EXCLUDED.key_time_hash,
      image_preview = EXCLUDED.image_preview,
      byte_size = EXCLUDED.byte_size
    RETURNING id, device_id, timestamp, encrypted_data, iv, image_hash,
      encrypted_hash, encryption_key_hash, key_time_hash, image_preview,
      byte_size, created_at
  `, [
    device_id,
    timestamp,
    encrypted.encrypted.toString('hex'),
    encrypted.iv.toString('hex'),
    encrypted.imageHash,
    encrypted.encryptedHash,
    encrypted.keyHash,
    encrypted.keyTimeHash,
    image.preview,
    imageBuffer.length,
  ]);

  logger.info('Laptop camera image captured and encrypted (AES-128)', {
    device_id,
    timestamp,
    byte_size: imageBuffer.length,
    image_hash: encrypted.imageHash,
  });

  return res.rows[0];
}

/**
 * Fetch latest image stream for a device
 */
async function getLatestImageStream(deviceId) {
  try {
    const res = await pool.query(`
      SELECT id, timestamp, encrypted_data, iv, image_hash, encrypted_hash,
             encryption_key_hash, key_time_hash, image_preview, byte_size, created_at
      FROM image_streams
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `, [deviceId]);
    
    return res.rows[0] || null;
  } catch (err) {
    logger.error('Image fetch error', { error: err.message || String(err) });
    return null;
  }
}

/**
 * Fetch image streams for a time range
 */
async function getImageStreamHistory(deviceId, limit = 50) {
  try {
    const res = await pool.query(`
      SELECT id, timestamp, encrypted_data, iv, image_hash, encrypted_hash,
             encryption_key_hash, key_time_hash, image_preview, byte_size, created_at
      FROM image_streams
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [deviceId, Math.min(limit, 100)]);
    
    return res.rows;
  } catch (err) {
    logger.error('Image history error', { error: err.message || String(err) });
    return [];
  }
}

module.exports = {
  processImageChunk,
  captureLaptopImage,
  getLatestImageStream,
  getImageStreamHistory,
};
