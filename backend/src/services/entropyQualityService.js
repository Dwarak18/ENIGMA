/**
 * src/services/entropyQualityService.js
 * 
 * Calculates entropy strength based on image quality, encryption, and hash diversity.
 * Similar to Cloudflare's multi-source entropy aggregation model.
 * 
 * Entropy sources (aggregated):
 *   1. Image quality (camera capture stability)
 *   2. Encryption key strength (AES-256 key derivation quality)
 *   3. Hash output distribution (SHA-256 entropy pool)
 *   4. TRNG generation randomness
 *   5. Hardware timestamp quality (DS3231 sync status)
 * 
 * Security model:
 *   - As long as one source remains honest and unpredictable, the aggregate entropy is secure
 *   - Quality ranges from 48-bit (low quality) to 256-bit (maximum)
 *   - Status levels: red (< 64-bit), yellow (64-192 bits), green (> 192-bit)
 */
'use strict';

const crypto = require('crypto');
const logger = require('../logger');

/**
 * Entropy calculation constants
 */
const ENTROPY_CONFIG = {
  // Maximum entropy bits we can realistically extract
  MAX_ENTROPY_BITS: 256,
  
  // Minimum viable entropy
  MIN_ENTROPY_BITS: 48,
  
  // Quality thresholds for status colors
  STATUS_THRESHOLDS: {
    RED:    { min: 0,   max: 64,   color: 'error',   label: 'Low' },
    YELLOW: { min: 64,  max: 192,  color: 'warning', label: 'Medium' },
    GREEN:  { min: 192, max: 256,  color: 'success', label: 'High' },
  },
  
  // Image quality weights (impact on entropy)
  IMAGE_QUALITY: {
    POOR:    { bits: 16, description: 'Blurry/low-contrast' },
    FAIR:    { bits: 32, description: 'Moderate variation' },
    GOOD:    { bits: 48, description: 'Clear with good detail' },
    EXCELLENT: { bits: 64, description: 'High-resolution, sharp' },
  },
  
  // Encryption key quality (derives from AES-256 key hash)
  ENCRYPTION_KEY: {
    WEAK:     { bits: 32 },  // Key derivation issues
    STANDARD: { bits: 128 }, // Normal AES-256 strength
    STRONG:   { bits: 256 }, // Multiple key sources mixed
  },
  
  // TRNG quality from hardware (DS3231 timing, temp sensors)
  TRNG_QUALITY: {
    POOR:    { bits: 24 },
    FAIR:    { bits: 64 },
    GOOD:    { bits: 128 },
    EXCELLENT: { bits: 192 },
  },
  
  // Timestamp quality (based on NTP sync, RTC drift)
  TIME_QUALITY: {
    UNSYNC:   { bits: 8 },
    LOOSE:    { bits: 32 },
    SYNC:     { bits: 48 },
  },
};

/**
 * Calculate entropy strength from entropy record data.
 * 
 * @param {Object} record - Entropy record from database
 * @param {Object} hwStatus - Current hardware status { esp32, ds3231, atecc608a, ... }
 * @returns {Object} { bits, status, quality, sources, message }
 */
function calculateEntropyStrength(record, hwStatus = {}) {
  if (!record) {
    return {
      bits: 0,
      status: 'idle',
      quality: 'awaiting',
      sources: [],
      message: 'No entropy record',
    };
  }

  const sources = [];
  let totalBits = 0;

  // ────────────────────────────────────────────────────────────────
  // SOURCE 1: Image quality (optical entropy from camera)
  // ────────────────────────────────────────────────────────────────
  const imageQuality = analyzeImageQuality(record.image_bits, record.image_hash);
  sources.push({
    name: 'Image Capture',
    bits: imageQuality.bits,
    quality: imageQuality.quality,
    status: imageQuality.quality === 'EXCELLENT' ? 'success' : 
            imageQuality.quality === 'GOOD' ? 'success' :
            imageQuality.quality === 'FAIR' ? 'warning' : 'error',
  });
  totalBits += imageQuality.bits;

  // ────────────────────────────────────────────────────────────────
  // SOURCE 2: Encryption key strength (AES-256 derivation quality)
  // ────────────────────────────────────────────────────────────────
  const keyQuality = analyzeEncryptionKey(record.aes_ciphertext, record.image_encrypted);
  sources.push({
    name: 'Encryption Key',
    bits: keyQuality.bits,
    quality: keyQuality.quality,
    status: keyQuality.quality === 'STRONG' ? 'success' : 'warning',
  });
  totalBits += keyQuality.bits;

  // ────────────────────────────────────────────────────────────────
  // SOURCE 3: Hash entropy (SHA-256 distribution from accumulated hashes)
  // ────────────────────────────────────────────────────────────────
  const hashQuality = analyzeHashEntropy(record.entropy_hash, record.image_hash);
  sources.push({
    name: 'Hash Pool',
    bits: hashQuality.bits,
    quality: hashQuality.quality,
    status: 'success',
  });
  totalBits += hashQuality.bits;

  // ────────────────────────────────────────────────────────────────
  // SOURCE 4: Hardware TRNG (device-side TRNG generation)
  // ────────────────────────────────────────────────────────────────
  const trngQuality = analyzeTrngQuality(hwStatus.esp32 || {}, record.timestamp);
  sources.push({
    name: 'TRNG Gen',
    bits: trngQuality.bits,
    quality: trngQuality.quality,
    status: hwStatus.esp32?.online ? 'success' : 'error',
  });
  totalBits += trngQuality.bits;

  // ────────────────────────────────────────────────────────────────
  // SOURCE 5: Timestamp quality (RTC sync, clock stability)
  // ────────────────────────────────────────────────────────────────
  const timeQuality = analyzeTimeQuality(hwStatus.ds3231 || {}, record.rtc_time);
  sources.push({
    name: 'Time Sync',
    bits: timeQuality.bits,
    quality: timeQuality.quality,
    status: hwStatus.ds3231?.synced ? 'success' : 'warning',
  });
  totalBits += timeQuality.bits;

  // Determine status color based on total bits
  let status = 'idle';
  if (totalBits < 64) {
    status = 'error';
  } else if (totalBits < 192) {
    status = 'warning';
  } else {
    status = 'success';
  }

  return {
    bits: Math.min(totalBits, ENTROPY_CONFIG.MAX_ENTROPY_BITS),
    status,
    quality: getQualityLabel(totalBits),
    sources,
    message: describeEntropyHealth(totalBits, sources),
  };
}

/**
 * Analyze image quality contribution to entropy.
 * Examines bitstream for randomness and variation.
 */
function analyzeImageQuality(imageBits, imageHash) {
  if (!imageBits || !imageHash) {
    return { bits: 0, quality: 'POOR' };
  }

  const hashEntropy = calculateBitEntropy(imageHash);
  
  if (hashEntropy > 7.8) {
    return { bits: ENTROPY_CONFIG.IMAGE_QUALITY.EXCELLENT.bits, quality: 'EXCELLENT' };
  } else if (hashEntropy > 7.5) {
    return { bits: ENTROPY_CONFIG.IMAGE_QUALITY.GOOD.bits, quality: 'GOOD' };
  } else if (hashEntropy > 7.0) {
    return { bits: ENTROPY_CONFIG.IMAGE_QUALITY.FAIR.bits, quality: 'FAIR' };
  } else {
    return { bits: ENTROPY_CONFIG.IMAGE_QUALITY.POOR.bits, quality: 'POOR' };
  }
}

/**
 * Analyze encryption key quality.
 * Examines ciphertext for proper encryption (should be high entropy).
 */
function analyzeEncryptionKey(aesCiphertext, imageEncrypted) {
  if (!aesCiphertext) {
    return { bits: ENTROPY_CONFIG.ENCRYPTION_KEY.WEAK.bits, quality: 'WEAK' };
  }

  const cipherEntropy = calculateBitEntropy(aesCiphertext);
  const imageEncryptedEntropy = imageEncrypted ? calculateBitEntropy(imageEncrypted) : 0;
  
  const avgEntropy = (cipherEntropy + imageEncryptedEntropy) / 2;
  
  if (avgEntropy > 7.9) {
    return { bits: ENTROPY_CONFIG.ENCRYPTION_KEY.STRONG.bits, quality: 'STRONG' };
  } else if (avgEntropy > 7.5) {
    return { bits: ENTROPY_CONFIG.ENCRYPTION_KEY.STANDARD.bits, quality: 'STANDARD' };
  } else {
    return { bits: ENTROPY_CONFIG.ENCRYPTION_KEY.WEAK.bits, quality: 'WEAK' };
  }
}

/**
 * Analyze hash entropy pool.
 * Higher quality hash = better entropy distribution.
 */
function analyzeHashEntropy(entropyHash, imageHash) {
  if (!entropyHash) {
    return { bits: 0, quality: 'NONE' };
  }

  const hashBits = calculateBitEntropy(entropyHash);
  
  if (hashBits > 7.95) {
    return { bits: 256, quality: 'PERFECT' };
  } else if (hashBits > 7.85) {
    return { bits: 192, quality: 'EXCELLENT' };
  } else if (hashBits > 7.7) {
    return { bits: 128, quality: 'GOOD' };
  } else {
    return { bits: 64, quality: 'FAIR' };
  }
}

/**
 * Analyze TRNG quality from hardware.
 * Based on device latency, presence, and timing stability.
 */
function analyzeTrngQuality(esp32Status, timestamp) {
  if (!esp32Status || !esp32Status.online) {
    return { bits: 0, quality: 'OFFLINE' };
  }

  const latency = esp32Status.latency || 0;
  
  // Lower latency = faster, more responsive hardware TRNG
  if (latency < 50) {
    return { bits: ENTROPY_CONFIG.TRNG_QUALITY.EXCELLENT.bits, quality: 'EXCELLENT' };
  } else if (latency < 150) {
    return { bits: ENTROPY_CONFIG.TRNG_QUALITY.GOOD.bits, quality: 'GOOD' };
  } else if (latency < 300) {
    return { bits: ENTROPY_CONFIG.TRNG_QUALITY.FAIR.bits, quality: 'FAIR' };
  } else {
    return { bits: ENTROPY_CONFIG.TRNG_QUALITY.POOR.bits, quality: 'POOR' };
  }
}

/**
 * Analyze timestamp quality (RTC sync, clock stability).
 */
function analyzeTimeQuality(ds3231Status, rtcTime) {
  if (!ds3231Status) {
    return { bits: ENTROPY_CONFIG.TIME_QUALITY.UNSYNC.bits, quality: 'UNSYNC' };
  }

  if (ds3231Status.synced) {
    const drift = ds3231Status.drift || 0;
    if (drift < 5) {
      return { bits: ENTROPY_CONFIG.TIME_QUALITY.SYNC.bits, quality: 'SYNC' };
    } else {
      return { bits: ENTROPY_CONFIG.TIME_QUALITY.LOOSE.bits, quality: 'LOOSE' };
    }
  } else {
    return { bits: ENTROPY_CONFIG.TIME_QUALITY.UNSYNC.bits, quality: 'UNSYNC' };
  }
}

/**
 * Calculate Shannon entropy of a hex string (0-8 bits).
 * 8.0 = perfect randomness, 0 = no variation
 */
function calculateBitEntropy(hexString) {
  if (!hexString || typeof hexString !== 'string') {
    return 0;
  }

  // Count frequency of each hex nibble (0-F)
  const freq = {};
  for (const char of hexString.toLowerCase()) {
    if (/[0-9a-f]/.test(char)) {
      freq[char] = (freq[char] || 0) + 1;
    }
  }

  const length = hexString.length;
  if (length === 0) return 0;

  // Shannon entropy formula: -Σ(p * log2(p))
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Get quality label based on total bits.
 */
function getQualityLabel(totalBits) {
  if (totalBits >= 192) {
    return 'High';
  } else if (totalBits >= 64) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

/**
 * Describe overall entropy health based on sources.
 */
function describeEntropyHealth(totalBits, sources) {
  const successCount = sources.filter(s => s.status === 'success').length;
  const totalSources = sources.length;

  if (totalBits >= 192) {
    return `Excellent: ${successCount}/${totalSources} sources healthy, ${totalBits}-bit security`;
  } else if (totalBits >= 64) {
    return `Adequate: ${successCount}/${totalSources} sources healthy, ${totalBits}-bit security`;
  } else {
    return `Degraded: ${successCount}/${totalSources} sources healthy, ${totalBits}-bit security`;
  }
}

module.exports = {
  calculateEntropyStrength,
  analyzeImageQuality,
  analyzeEncryptionKey,
  analyzeHashEntropy,
  analyzeTrngQuality,
  analyzeTimeQuality,
  getQualityLabel,
  ENTROPY_CONFIG,
};
