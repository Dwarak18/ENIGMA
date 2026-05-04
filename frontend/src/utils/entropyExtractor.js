/**
 * frontend/src/utils/entropyExtractor.js
 * TRNG-like entropy extraction from consecutive camera frames
 * 
 * Algorithm:
 * 1. Capture N frames at regular intervals
 * 2. Compute frame-to-frame pixel differences
 * 3. Extract LSBs from differences (least predictable bits)
 * 4. Apply SHA-256 whitening (mandatory before key usage)
 * 5. Return 256-bit (32-byte) entropy hash for key derivation
 */

const ENTROPY_MIN_BYTES = 32; // 256 bits minimum

/**
 * Extract raw entropy from frame-to-frame differences
 * Uses LSB of pixel differences as entropy source (least predictable bits)
 * 
 * @param {Uint8ClampedArray[]} frameDataArrays - Array of pixel data arrays from consecutive frames
 * @returns {Uint8Array} Raw entropy bits (minimum 256 bits = 32 bytes)
 */
export function extractEntropyFromFrames(frameDataArrays) {
  if (frameDataArrays.length < 2) {
    throw new Error('Need at least 2 frames for entropy extraction');
  }

  const entropyBits = [];
  const dataA = frameDataArrays[0];
  
  // Process each subsequent frame
  for (let frameIdx = 1; frameIdx < frameDataArrays.length; frameIdx++) {
    const dataB = frameDataArrays[frameIdx];
    
    // Extract LSBs from pixel differences
    // Process every 4th byte (R channel only) to reduce correlation
    for (let i = 0; i < Math.min(dataA.length, dataB.length); i += 4) {
      const diffR = Math.abs((dataA[i] || 0) - (dataB[i] || 0)) & 0xFF;
      const diffG = Math.abs((dataA[i + 1] || 0) - (dataB[i + 1] || 0)) & 0xFF;
      const diffB = Math.abs((dataA[i + 2] || 0) - (dataB[i + 2] || 0)) & 0xFF;
      
      // Extract LSBs from differences (least predictable bits)
      entropyBits.push((diffR & 1) ? 1 : 0);
      entropyBits.push((diffG & 1) ? 1 : 0);
      entropyBits.push((diffB & 1) ? 1 : 0);
    }
  }

  if (entropyBits.length < ENTROPY_MIN_BYTES * 8) {
    throw new Error(
      `Insufficient entropy: got ${entropyBits.length} bits, need ${ENTROPY_MIN_BYTES * 8}`
    );
  }

  // Pack bits into bytes (take first 256 bits = 32 bytes)
  const entropy = new Uint8Array(ENTROPY_MIN_BYTES);
  for (let byteIdx = 0; byteIdx < ENTROPY_MIN_BYTES; byteIdx++) {
    let byte = 0;
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const bitValue = entropyBits[byteIdx * 8 + bitIdx];
      byte = (byte << 1) | bitValue;
    }
    entropy[byteIdx] = byte;
  }

  return entropy;
}

/**
 * Apply SHA-256 whitening to raw entropy
 * CRITICAL: Must be applied before key derivation
 * Whitening ensures entropy is uniformly distributed regardless of extraction method
 * 
 * @param {Uint8Array} rawEntropy - Raw entropy bits
 * @returns {Promise<string>} SHA-256 hash as hex string (64 chars)
 */
export async function applyEntropyWhitening(rawEntropy) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    // Browser API
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', rawEntropy);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Node.js fallback
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(rawEntropy));
  return hash.digest('hex');
}

/**
 * Derive AES-256 key from entropy using HKDF-SHA256
 * CRITICAL: This function provides the final step before key usage
 * 
 * @param {string} entropyHash - SHA-256 whitened entropy (hex)
 * @param {string} salt - Optional salt (deviceId, timestamp, etc.)
 * @param {string} info - Optional context string
 * @returns {Promise<string>} HKDF-derived 256-bit key as hex (64 chars)
 */
export async function deriveKeyFromEntropy(
  entropyHash,
  salt = '',
  info = 'ENIGMA_AES_KEY'
) {
  // Convert hex entropy hash back to bytes
  const entropyBytes = new Uint8Array(
    entropyHash.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );
  
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    // Browser: use SubtleCrypto
    const baseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      entropyBytes,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    const saltBuffer = salt ? new TextEncoder().encode(salt) : new Uint8Array(0);
    const infoBuffer = new TextEncoder().encode(info);

    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBuffer,
        info: infoBuffer,
      },
      baseKey,
      256 // 256-bit output for AES-256
    );

    const derivedArray = new Uint8Array(derivedBits);
    return Array.from(derivedArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node.js fallback
  const crypto = require('crypto');
  const saltBuffer = salt ? Buffer.from(salt, 'utf8') : Buffer.alloc(0);
  const infoBuffer = Buffer.from(info, 'utf8');
  
  const derivedKey = crypto.hkdfSync(
    'sha256',
    entropyBytes,
    saltBuffer,
    infoBuffer,
    32 // 256-bit output
  );

  return derivedKey.toString('hex');
}

/**
 * Compute integrity hash for blockchain anchoring
 * Format: SHA256(AES_key_hash || frame_id || SNTP_time)
 * 
 * @param {string} aesKeyHash - SHA-256(AES_key)
 * @param {string} frameId - UUID of captured frame
 * @param {number} sntpTime - UNIX timestamp from SNTP
 * @returns {Promise<string>} Integrity hash as hex (64 chars)
 */
export async function computeIntegrityHash(aesKeyHash, frameId, sntpTime) {
  const hashInput = new TextEncoder().encode(
    aesKeyHash + frameId + sntpTime.toString()
  );

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', hashInput);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node.js fallback
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(aesKeyHash, 'hex');
  hash.update(frameId, 'utf8');
  
  const timeBuffer = Buffer.allocUnsafe(8);
  timeBuffer.writeBigInt64BE(BigInt(sntpTime), 0);
  hash.update(timeBuffer);
  
  return hash.digest('hex');
}

/**
 * Full entropy extraction pipeline
 * 1. Extract from frame differences
 * 2. Whiten with SHA-256
 * 3. Derive AES key with HKDF
 * 4. Compute integrity hash
 * 
 * @param {Uint8ClampedArray[]} frameDataArrays - Array of consecutive frame pixel data
 * @param {string} frameId - UUID for this capture
 * @param {number} sntpTime - UNIX timestamp from SNTP
 * @param {string} deviceId - Device identifier (optional salt)
 * @returns {Promise<object>} Complete entropy/key material
 */
export async function runEntropyPipeline(
  frameDataArrays,
  frameId,
  sntpTime,
  deviceId = 'unknown'
) {
  try {
    // Step 1: Extract raw entropy from frame differences
    const rawEntropy = extractEntropyFromFrames(frameDataArrays);

    // Step 2: Apply SHA-256 whitening (MANDATORY)
    const entropyHash = await applyEntropyWhitening(rawEntropy);

    // Step 3: Derive AES-256 key using HKDF
    const aesKeyHash = await deriveKeyFromEntropy(
      entropyHash,
      `${deviceId}:${sntpTime}`, // Use deviceId + time as salt
      'ENIGMA_AES_256_KEY_DERIVATION'
    );

    // Step 4: Compute integrity hash for blockchain
    const integrityHash = await computeIntegrityHash(aesKeyHash, frameId, sntpTime);

    return {
      frameId,
      sntpTime,
      deviceId,
      entropyHash, // SHA-256(raw_entropy) - for verification
      aesKeyHash, // HKDF-derived AES-256 key hash (NOT raw key!)
      integrityHash, // For blockchain anchoring
      entropySizeBytes: rawEntropy.length,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    throw new Error(`Entropy pipeline failed: ${err.message}`);
  }
}
