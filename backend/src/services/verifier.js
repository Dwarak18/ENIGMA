/**
 * src/services/verifier.js
 * ECDSA signature verification (secp256r1 / P-256).
 *
 * Uses Node.js built-in `crypto`  – no additional dependencies.
 *
 * Curve: prime256v1 (secp256r1 / NIST P-256)
 * Algorithm: ECDSA with SHA-256
 *
 * Input from edge device:
 *   public_key   – 130-char hex  (04 || X || Y, 65 bytes uncompressed)
 *   entropy_hash – 64-char hex   (32 bytes SHA-256 digest)
 *   signature    – 128-char hex  (raw r || s, 64 bytes)
 *
 * Note: Node crypto requires the signature in DER format (ASN.1), but the
 * firmware sends raw r||s.  We convert here.
 */
'use strict';

const crypto = require('crypto');
const logger = require('../logger');

/**
 * Convert raw 64-byte ECDSA signature (r||s) to DER-encoded ASN.1.
 *
 * DER format:
 *   SEQUENCE {
 *     INTEGER r,
 *     INTEGER s
 *   }
 */
function rawSigToDer(rawHex) {
  const raw = Buffer.from(rawHex, 'hex');
  if (raw.length !== 64) throw new Error('Raw signature must be 64 bytes');

  let r = raw.slice(0, 32);
  let s = raw.slice(32, 64);

  // Pad with leading 0x00 if high bit set (to keep positive integer encoding)
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);

  // INTEGER wrappers
  const rDer = Buffer.concat([Buffer.from([0x02, r.length]), r]);
  const sDer = Buffer.concat([Buffer.from([0x02, s.length]), s]);

  // SEQUENCE wrapper
  const seq = Buffer.concat([rDer, sDer]);
  return Buffer.concat([Buffer.from([0x30, seq.length]), seq]);
}

/**
 * Wrap uncompressed public key bytes in SPKI (SubjectPublicKeyInfo) DER.
 * Required by Node crypto.createPublicKey({ format: 'der', type: 'spki' }).
 *
 * Structure (fixed for P-256):
 *   SEQUENCE {
 *     SEQUENCE {
 *       OID 1.2.840.10045.2.1  (ecPublicKey)
 *       OID 1.2.840.10045.3.1.7 (prime256v1)
 *     }
 *     BIT STRING <uncompressed point>
 *   }
 */
const P256_SPKI_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex'
);

function pubkeyHexToSpki(pubkeyHex) {
  const point = Buffer.from(pubkeyHex, 'hex');
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('Expected 65-byte uncompressed public key (04||X||Y)');
  }
  return Buffer.concat([P256_SPKI_PREFIX, point]);
}

/**
 * Verify an ECDSA/SHA-256 signature.
 *
 * @param {string} pubkeyHex     130-char hex uncompressed public key
 * @param {string} hashHex       64-char hex SHA-256 digest
 * @param {string} signatureHex  128-char hex raw r||s signature
 * @returns {boolean}
 */
function verifySignature(pubkeyHex, hashHex, signatureHex) {
  try {
    const spki      = pubkeyHexToSpki(pubkeyHex);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const derSig    = rawSigToDer(signatureHex);
    const hashBuf   = Buffer.from(hashHex, 'hex');

    // Node.js createVerify('SHA256') hashes hashBuf internally before the EC
    // verify operation. The firmware's sign_hash() mirrors this by applying
    // an extra SHA-256 pass before mbedtls_ecdsa_sign(), so all three sides
    // (firmware, simulator, backend) agree on ECDSA-SHA-256 semantics.
    const verifier = crypto.createVerify('SHA256');
    verifier.update(hashBuf);
    return verifier.verify(publicKey, derSig);
  } catch (err) {
    logger.warn('verifySignature threw an error', { error: err.message });
    return false;
  }
}

module.exports = { verifySignature };
