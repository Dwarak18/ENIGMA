/**
 * backend/src/services/keyDerivationService.js
 * 
 * Secure key derivation using HKDF-SHA256
 * CRITICAL: Never use raw entropy as encryption key
 * 
 * Implements:
 * 1. HKDF-SHA256 for key derivation (RFC 5869)
 * 2. Salted key generation (device_id + timestamp)
 * 3. AES-256 key hashing (store hash, never raw key)
 * 4. Integrity hash computation for blockchain
 */

const crypto = require('crypto');
const logger = require('../logger');

/**
 * Compute HKDF-SHA256 derived key
 * RFC 5869 - HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
 * 
 * Extract phase: PRK = HMAC-Hash(salt, IKM)
 * Expand phase: T(0) = empty string
 *              T(1) = HMAC-Hash(PRK, T(0) || info || 0x01)
 *              T(2) = HMAC-Hash(PRK, T(1) || info || 0x02)
 *              OKM = T(1) || T(2) || ... (truncated to L bytes)
 * 
 * @param {Buffer|string} entropyHash - SHA-256 whitened entropy (hex string)
 * @param {string} salt - Derivation salt (e.g., deviceId:timestamp)
 * @param {string} info - Context/application info string
 * @param {number} length - Output length in bytes (default: 32 for AES-256)
 * @returns {string} Derived key as hex string
 */
function hkdfDerive(entropyHash, salt, info, length = 32) {
  try {
    // Convert entropy hash from hex to Buffer
    const ikm = Buffer.from(entropyHash, 'hex');
    const saltBuffer = Buffer.from(salt, 'utf8');
    const infoBuffer = Buffer.from(info, 'utf8');

    // Node.js 15+ has built-in HKDF
    const derivedKey = crypto.hkdfSync(
      'sha256',
      ikm,
      saltBuffer,
      infoBuffer,
      length
    );

    return derivedKey.toString('hex');
  } catch (err) {
    logger.error('HKDF derivation failed', { error: err.message });
    throw new Error(`Failed to derive key: ${err.message}`);
  }
}

/**
 * Hash a raw AES key (never store the key itself!)
 * Stores only: SHA-256(AES_key)
 * 
 * @param {string} aesKeyHex - AES key as hex string (64 chars for 256-bit)
 * @returns {string} SHA-256 hash of key as hex string
 */
function hashAesKey(aesKeyHex) {
  const hash = crypto.createHash('sha256');
  hash.update(aesKeyHex, 'hex');
  return hash.digest('hex');
}

/**
 * Generate encryption IV (initialization vector)
 * For AES-GCM: 12 bytes is recommended (96 bits)
 * 
 * @returns {string} Random IV as hex string (24 chars = 12 bytes)
 */
function generateIV() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Generate authentication tag (used with AES-GCM)
 * Tags are 16 bytes (128 bits) for AES-GCM
 * Automatically handled by crypto.createCipheriv
 * 
 * @returns {number} Tag length in bytes
 */
function getAuthTagLength() {
  return 16; // 128-bit tag for GCM
}

/**
 * Compute final integrity hash for blockchain anchoring
 * Format: SHA256(aes_key_hash || frame_id || sntp_time)
 * Used for immutable blockchain record
 * 
 * @param {string} aesKeyHash - SHA-256(AES_key)
 * @param {string} frameId - UUID of image frame
 * @param {number} sntpTimestamp - UNIX timestamp from SNTP
 * @returns {string} Integrity hash as hex string (64 chars)
 */
function computeBlockchainHash(aesKeyHash, frameId, sntpTimestamp) {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(aesKeyHash, 'hex');
    hash.update(frameId, 'utf8');
    
    // Append timestamp as big-endian 64-bit integer
    const timeBuffer = Buffer.allocUnsafe(8);
    timeBuffer.writeBigInt64BE(BigInt(sntpTimestamp), 0);
    hash.update(timeBuffer);
    
    return hash.digest('hex');
  } catch (err) {
    logger.error('Blockchain hash computation failed', { error: err.message });
    throw new Error(`Failed to compute blockchain hash: ${err.message}`);
  }
}

/**
 * Encrypt data using AES-256-GCM
 * AES-GCM provides both confidentiality AND authenticity
 * 
 * @param {Buffer} plaintext - Data to encrypt
 * @param {string} aesKeyHex - AES key (from derivation, not hash!)
 * @param {string|null} iv - Optional IV (generated if not provided)
 * @returns {object} { ciphertext, iv, authTag } all as hex strings
 */
function encryptAesGcm(plaintext, aesKeyHex, iv = null) {
  try {
    const aesKeyBuffer = Buffer.from(aesKeyHex, 'hex');
    const ivBuffer = iv ? Buffer.from(iv, 'hex') : crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKeyBuffer, ivBuffer);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: ciphertext.toString('hex'),
      iv: ivBuffer.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (err) {
    logger.error('AES-GCM encryption failed', { error: err.message });
    throw new Error(`Encryption failed: ${err.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * Verifies authentication tag before returning plaintext
 * 
 * @param {string} ciphertextHex - Encrypted data as hex
 * @param {string} ivHex - Initialization vector as hex
 * @param {string} authTagHex - Authentication tag as hex
 * @param {string} aesKeyHex - AES key (must match encryption key)
 * @returns {Buffer} Decrypted plaintext
 */
function decryptAesGcm(ciphertextHex, ivHex, authTagHex, aesKeyHex) {
  try {
    const aesKeyBuffer = Buffer.from(aesKeyHex, 'hex');
    const ivBuffer = Buffer.from(ivHex, 'hex');
    const ciphertextBuffer = Buffer.from(ciphertextHex, 'hex');
    const authTagBuffer = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyBuffer, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const plaintext = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    return plaintext;
  } catch (err) {
    logger.error('AES-GCM decryption failed', { error: err.message });
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

/**
 * Full key derivation pipeline
 * 1. HKDF-derive AES-256 key from entropy
 * 2. Hash the key (store hash, never raw key)
 * 3. Generate IV for encryption
 * 4. Compute blockchain integrity hash
 * 
 * @param {string} entropyHash - SHA-256 whitened entropy (hex)
 * @param {string} deviceId - Device identifier (part of salt)
 * @param {number} timestamp - Timestamp (part of salt)
 * @param {string} frameId - Frame UUID
 * @returns {object} Complete key material and hashes
 */
function deriveKeyMaterial(entropyHash, deviceId, timestamp, frameId) {
  try {
    // Step 1: Derive AES-256 key using HKDF
    const salt = `${deviceId}:${timestamp}`;
    const aesKeyDerived = hkdfDerive(
      entropyHash,
      salt,
      'ENIGMA_AES_256_KEY_DERIVATION_v1',
      32 // 256-bit key
    );

    // Step 2: Hash the key (store ONLY this hash, never raw key)
    const aesKeyHash = hashAesKey(aesKeyDerived);

    // Step 3: Generate IV for encryption
    const iv = generateIV();

    // Step 4: Compute blockchain integrity hash
    const blockchainHash = computeBlockchainHash(aesKeyHash, frameId, timestamp);

    return {
      // Key material (ephemeral, use for encryption only)
      aesKeyDerived, // NEVER persist this
      
      // Hashes (safe to store)
      aesKeyHash, // Store this in DB
      iv, // Store this with encrypted data
      blockchainHash, // Store on blockchain
      
      // Metadata
      deviceId,
      timestamp,
      frameId,
      entropy_bytes: 32, // 256-bit entropy input
      derived_key_bytes: 32, // 256-bit AES key output
    };
  } catch (err) {
    logger.error('Key derivation pipeline failed', { error: err.message });
    throw new Error(`Key derivation failed: ${err.message}`);
  }
}

module.exports = {
  hkdfDerive,
  hashAesKey,
  generateIV,
  getAuthTagLength,
  computeBlockchainHash,
  encryptAesGcm,
  decryptAesGcm,
  deriveKeyMaterial,
};
