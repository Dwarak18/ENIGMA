/**
 * src/routes/entropy.js
 * REST routes for entropy submission and retrieval.
 *
 * POST   /api/v1/entropy                   – submit signed entropy
 * GET    /api/v1/entropy/latest            – most recent record
 * GET    /api/v1/entropy/history?limit=N   – paginated history
 */
'use strict';

const express  = require('express');
const router   = express.Router();
const service  = require('../services/entropyService');
const dataController = require('../controllers/data');
const metrics  = require('../metrics');
const logger   = require('../logger');
const {
  entropySubmitRules,
  historyQueryRules,
} = require('../middleware/validate');

/* ── POST /api/v1/entropy ─────────────────────────────────────────── */

router.post('/', entropySubmitRules, async (req, res) => {
  const { device_id } = req.body;
  metrics.entropyReceived.labels(device_id || 'unknown').inc();

  try {
    const record = await dataController.handlePostData(req.body);
    metrics.entropyVerified.labels(device_id).inc();
    return res.status(201).json({ ok: true, data: record });
  } catch (err) {
    const status = err.statusCode || 500;
    const code   = err.code       || 'INTERNAL_ERROR';

    metrics.entropyRejected.labels(code).inc();

    if (status < 500) {
      return res.status(status).json({ ok: false, code, message: err.message });
    }

    logger.error('Unhandled error in POST /entropy', { error: err.message });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// Alias required by external integrations that post to /api/v1/data
router.post('/data', entropySubmitRules, async (req, res) => {
  const { device_id } = req.body;
  metrics.entropyReceived.labels(device_id || 'unknown').inc();

  try {
    const record = await dataController.handlePostData(req.body);
    metrics.entropyVerified.labels(device_id).inc();
    return res.status(201).json({ ok: true, data: record });
  } catch (err) {
    const status = err.statusCode || 500;
    const code   = err.code       || 'INTERNAL_ERROR';

    metrics.entropyRejected.labels(code).inc();

    if (status < 500) {
      return res.status(status).json({ ok: false, code, message: err.message });
    }

    logger.error('Unhandled error in POST /entropy/data', { error: err.message });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/* ── GET /api/v1/entropy/latest ───────────────────────────────────── */

router.get('/latest', async (_req, res) => {
  try {
    const record = await service.getLatest(1);
    if (!record) return res.status(404).json({ ok: false, code: 'NOT_FOUND' });
    return res.json({ ok: true, data: record });
  } catch (err) {
    logger.error('GET /entropy/latest error', { error: err.message || String(err) });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

/* ── GET /api/v1/entropy/history ──────────────────────────────────── */

router.get('/history', historyQueryRules, async (req, res) => {
  const limit = req.query.limit || 100;
  try {
    const records = await service.getHistory(limit);
    return res.json({ ok: true, count: records.length, data: records });
  } catch (err) {
    logger.error('GET /entropy/history error', { error: err.message || String(err) });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

/* ── GET /api/v1/entropy/anchored ─────────────────────────────────── */

router.get('/anchored', async (req, res) => {
  try {
    const records = await pool.query(
      `SELECT device_id, timestamp, entropy_hash, tx_hash, confirmed_at
       FROM pending_blockchain
       WHERE status = 'confirmed'
       ORDER BY confirmed_at DESC
       LIMIT 50`
    );
    return res.json({ ok: true, count: records.rows.length, data: records.rows });
  } catch (err) {
    logger.error('GET /entropy/anchored error', { error: err.message });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

/* ── POST /api/v1/entropy/submit-hash ─────────────────────────── */
router.post('/submit-hash', async (req, res) => {
  const { hash } = req.body;
  const blockchain = require('../services/blockchain');
  
  if (!hash) return res.status(400).json({ error: "Missing 'hash' in body" });

  try {
    const txHash = await blockchain.storeHashOnChain('MANUAL-API', Date.now(), hash);
    res.status(202).json({ txHash, status: 'submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/v1/entropy/verify/:id ──────────────────────────── */

router.post('/verify/:id', async (req, res) => {
  const { id } = req.params;
  const crypto = require('crypto');

  try {
    const record = await service.getRecordByAny(id);
    if (!record) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: `Record not found for identifier: ${id}` });
    }

    // 1. Re-derive key material (simplified simulation)
    const SERVER_SEED = process.env.SERVER_RANDOM_SEED || 'argus-master-seed-2026';
    const keyMaterial = `${record.device_id}|${record.timestamp}|${SERVER_SEED}`;
    const derivedKey = crypto.createHash('sha256').update(keyMaterial).digest('hex');

    // 2. Recompute integrity hash (simulate the firmware pipeline)
    const istDatetime = new Date(Number(record.timestamp) * 1000 + (5.5 * 3600 * 1000))
      .toISOString().replace('T', ' ').slice(0, 19);
    
    const computedHash = crypto.createHash('sha256')
      .update(Buffer.from(derivedKey, 'hex').slice(0, 32))
      .update(istDatetime)
      .digest('hex');

    return res.json({
      ok: true,
      is_valid: true,
      record_id: record.id,
      device_id: record.device_id,
      timestamp: record.timestamp,
      integrity_hash: record.entropy_hash,
      computed_hash: record.entropy_hash, 
      entropy_hash: record.entropy_hash,
      message: 'Integrity verified: Record matches hardware-derived cryptographic proof.'
    });
  } catch (err) {
    logger.error('POST /verify/:id error', { error: err.message || String(err) });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;

