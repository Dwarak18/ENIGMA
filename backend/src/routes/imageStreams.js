/**
 * src/routes/imageStreams.js
 * REST API endpoints for querying image streams
 *
 * Routes:
 *   GET  /api/v1/image-streams/:device_id/latest
 *   GET  /api/v1/image-streams/:device_id/history
 */
'use strict';

const express = require('express');
const router = express.Router();
const logger  = require('../logger');
const { getLatestImageStream, getImageStreamHistory } = require('../services/imageStreamService');

/**
 * GET /api/v1/image-streams/:device_id/latest
 * Fetch the most recent image stream for a device
 */
router.get('/:device_id/latest', async (req, res) => {
  try {
    const { device_id } = req.params;
    if (!device_id) {
      return res.status(400).json({ ok: false, code: 'INVALID_DEVICE_ID' });
    }

    const stream = await getLatestImageStream(device_id);
    if (!stream) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND' });
    }

    res.json({
      ok: true,
      data: {
        device_id,
        timestamp: stream.timestamp,
        encrypted_data: stream.encrypted_data,
        iv: stream.iv,
        created_at: stream.created_at,
      },
    });
  } catch (err) {
    logger.error('GET /image-streams/:device_id/latest error', {
      error: err.message || String(err),
    });
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/v1/image-streams/:device_id/history
 * Fetch image stream history for a device (paginated)
 *
 * Query params:
 *   ?limit=20  (default: 20, max: 100)
 */
router.get('/:device_id/history', async (req, res) => {
  try {
    const { device_id } = req.params;
    const { limit = 20 } = req.query;

    if (!device_id) {
      return res.status(400).json({ ok: false, code: 'INVALID_DEVICE_ID' });
    }

    const streams = await getImageStreamHistory(device_id, parseInt(limit, 10));

    res.json({
      ok: true,
      count: streams.length,
      data: streams.map(s => ({
        device_id,
        timestamp: s.timestamp,
        encrypted_data: s.encrypted_data,
        iv: s.iv,
        created_at: s.created_at,
      })),
    });
  } catch (err) {
    logger.error('GET /image-streams/:device_id/history error', {
      error: err.message || String(err),
    });
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
