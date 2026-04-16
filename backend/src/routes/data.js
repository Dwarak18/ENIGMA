'use strict';

const express = require('express');
const router = express.Router();

const metrics = require('../metrics');
const logger = require('../logger');
const { entropySubmitRules } = require('../middleware/validate');
const dataController = require('../controllers/data');

router.post('/', entropySubmitRules, async (req, res) => {
  const { device_id } = req.body;
  metrics.entropyReceived.labels(device_id || 'unknown').inc();

  try {
    const record = await dataController.handlePostData(req.body);
    metrics.entropyVerified.labels(device_id).inc();
    return res.status(201).json({ ok: true, data: record });
  } catch (err) {
    const status = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    metrics.entropyRejected.labels(code).inc();

    if (status < 500) {
      return res.status(status).json({ ok: false, code, message: err.message });
    }

    logger.error('Unhandled error in POST /data', { error: err.message || String(err) });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

module.exports = router;
