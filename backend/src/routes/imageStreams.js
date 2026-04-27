/**
 * src/routes/imageStreams.js
 * REST API endpoints for querying image streams
 *
 * Routes:
 *   POST /api/v1/image-streams/capture
 *   GET  /api/v1/image-streams/:device_id/latest
 *   GET  /api/v1/image-streams/:device_id/history
 */
'use strict';

const express = require('express');
const router = express.Router();
const logger  = require('../logger');
const {
  captureLaptopImage,
  getLatestImageStream,
  getImageStreamHistory,
} = require('../services/imageStreamService');

function serializeStream(stream, device_id = stream.device_id) {
  return {
    id: stream.id,
    device_id,
    timestamp: Number(stream.timestamp),
    encrypted_data: stream.encrypted_data,
    iv: stream.iv,
    image_hash: stream.image_hash,
    encrypted_hash: stream.encrypted_hash,
    encryption_key_hash: stream.encryption_key_hash,
    key_time_hash: stream.key_time_hash,
    image_preview: stream.image_preview,
    byte_size: stream.byte_size,
    created_at: stream.created_at,
  };
}

router.post('/capture', async (req, res) => {
  try {
    const { device_id, image_base64, esp_time } = req.body || {};
    if (!device_id || typeof device_id !== 'string') {
      return res.status(400).json({ ok: false, code: 'INVALID_DEVICE_ID' });
    }
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ ok: false, code: 'INVALID_IMAGE' });
    }

    const stream = await captureLaptopImage({
      deviceId: device_id,
      imageBase64: image_base64,
      espTime: esp_time,
    });

    return res.status(201).json({ ok: true, data: serializeStream(stream) });
  } catch (err) {
    logger.error('POST /image-streams/capture error', {
      error: err.message || String(err),
    });
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.statusCode ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      message: err.message || 'Internal error',
    });
  }
});

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
        ...serializeStream(stream, device_id),
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
      data: streams.map(s => serializeStream(s, device_id)),
    });
  } catch (err) {
    logger.error('GET /image-streams/:device_id/history error', {
      error: err.message || String(err),
    });
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
