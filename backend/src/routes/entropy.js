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
    const record = await service.processEntropy(req.body);
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

/* ── GET /api/v1/entropy/latest ───────────────────────────────────── */

router.get('/latest', async (_req, res) => {
  try {
    const record = await service.getLatest(1);
    if (!record) return res.status(404).json({ ok: false, code: 'NOT_FOUND' });
    return res.json({ ok: true, data: record });
  } catch (err) {
    logger.error('GET /entropy/latest error', { error: err.message });
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
    logger.error('GET /entropy/history error', { error: err.message });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
