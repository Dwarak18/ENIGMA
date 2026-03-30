/**
 * tests/entropy.test.js
 * Integration tests for the /api/v1/entropy endpoint.
 *
 * Run: npm test
 * Requires a running PostgreSQL instance (uses DATABASE_URL from .env).
 */
'use strict';

const request = require('supertest');
const crypto  = require('crypto');

/* Load app after env setup */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://enigma:changeme@localhost:5432/enigma_db';

const { app } = require('../src/index');

/* ── Helper: generate a valid test keypair and payload ─────────────── */
function generateTestPayload() {
  // Generate P-256 keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const timestamp    = Math.floor(Date.now() / 1000);
  const entropyBytes = crypto.randomBytes(64);

  // Compute SHA-256(entropy || timestamp_le8)
  const tsBytes = Buffer.alloc(8);
  tsBytes.writeBigUInt64LE(BigInt(timestamp));
  const hashBuf = crypto.createHash('sha256')
    .update(entropyBytes)
    .update(tsBytes)
    .digest();

  // Sign
  const sign = crypto.createSign('SHA256');
  sign.update(hashBuf);
  const derSig = sign.sign(privateKey);

  // Parse DER → raw r||s
  function derToRaw(der) {
    let offset = 2;                      // skip SEQUENCE tag+len
    offset++;                            // skip INTEGER tag
    const rLen = der[offset++];
    const rStart = offset + (der[offset - 1] === 0x00 && rLen > 32 ? 1 : 0);
    const r = der.slice(rLen > 32 ? rStart + 1 : rStart,
                        offset + rLen - (der[rStart - 1] === 0x00 ? 1 : 0));
    offset += rLen;
    offset++;                            // skip INTEGER tag
    const sLen = der[offset++];
    const sStart = offset + (der[offset - 1] === 0x00 && sLen > 32 ? 1 : 0);
    const s = der.slice(sLen > 32 ? sStart + 1 : sStart,
                        offset + sLen - (der[sStart - 1] === 0x00 ? 1 : 0));

    const rb = Buffer.alloc(32); r.copy(rb, 32 - r.length);
    const sb = Buffer.alloc(32); s.copy(sb, 32 - s.length);
    return Buffer.concat([rb, sb]);
  }

  // Use a simpler approach: export raw via WebCrypto-style DER parsing
  // This is a simplified test helper, not production code
  const rawSig = derToRaw(derSig);

  // Export uncompressed public key
  const pubDer   = publicKey.export({ type: 'spki', format: 'der' });
  const pubPoint = pubDer.slice(pubDer.length - 65);  // last 65 bytes = 04||X||Y

  return {
    device_id:    'test-device-001',
    timestamp,
    entropy_hash: hashBuf.toString('hex'),
    signature:    rawSig.toString('hex'),
    public_key:   pubPoint.toString('hex'),
  };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe('POST /api/v1/entropy', () => {
  it('should accept a valid signed payload and return 201', async () => {
    const payload = generateTestPayload();
    const res = await request(app)
      .post('/api/v1/entropy')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect([201, 409]).toContain(res.status);   // 409 if replay from prior run
    expect(res.body.ok).toBeDefined();
  });

  it('should reject a payload with a bad signature', async () => {
    const payload = generateTestPayload();
    payload.signature = 'a'.repeat(128);         // deliberately wrong

    const res = await request(app)
      .post('/api/v1/entropy')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('should reject a stale timestamp', async () => {
    const payload = generateTestPayload();
    payload.timestamp = Math.floor(Date.now() / 1000) - 120;  // 2 minutes old

    const res = await request(app)
      .post('/api/v1/entropy')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STALE_TIMESTAMP');
  });

  it('should reject missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/entropy')
      .send({ device_id: 'test' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/entropy/latest', () => {
  it('should return 200 with a record or 404', async () => {
    const res = await request(app).get('/api/v1/entropy/latest');
    expect([200, 404]).toContain(res.status);
  });
});

describe('GET /api/v1/entropy/history', () => {
  it('should return an array', async () => {
    const res = await request(app)
      .get('/api/v1/entropy/history')
      .query({ limit: 10 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should reject limit > 1000', async () => {
    const res = await request(app)
      .get('/api/v1/entropy/history')
      .query({ limit: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('should return 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
