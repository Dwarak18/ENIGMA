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

const CAPTURE_INTERVAL_SECONDS = parseInt(process.env.CAPTURE_INTERVAL_SECONDS || '10', 10);

function computeNextCaptureIn(timestamp) {
  const interval = Number.isFinite(CAPTURE_INTERVAL_SECONDS) && CAPTURE_INTERVAL_SECONDS > 0
    ? CAPTURE_INTERVAL_SECONDS
    : 10;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return interval;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  return Math.max(0, interval - elapsed);
}

function serializeStream(stream, device_id = stream.device_id, includeCaptureMeta = false) {
  const data = {
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

  if (includeCaptureMeta) {
    data.next_capture_in = computeNextCaptureIn(stream.timestamp);
  }

  return data;
}

function parseCaptureInterval(queryValue) {
  if (queryValue === undefined) return null;
  const parsed = Number.parseInt(queryValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function withConfiguredCaptureMeta(data, req) {
  const includeCaptureMeta = req.query.next_capture_in === '1';
  if (!includeCaptureMeta) return data;
  const requestedInterval = parseCaptureInterval(req.query.capture_interval_s);
  if (requestedInterval === null) {
    return { ...data, next_capture_in: computeNextCaptureIn(data.timestamp) };
  }
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - Number(data.timestamp));
  const next = Math.max(0, requestedInterval - elapsed);
  return { ...data, next_capture_in: next };
}

function streamWithCaptureMeta(stream, device_id, req) {
  const base = serializeStream(stream, device_id);
  return withConfiguredCaptureMeta(base, req);
}

function streamListWithCaptureMeta(streams, device_id, req) {
  return streams.map((stream) => withConfiguredCaptureMeta(serializeStream(stream, device_id), req));
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

    return res.status(201).json({ ok: true, data: serializeStream(stream, device_id, true) });
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

    return res.json({
      ok: true,
      data: streamWithCaptureMeta(stream, device_id, req),
    });
  } catch (err) {
    logger.error('GET /image-streams/:device_id/latest error', {
      error: err.message || String(err),
    });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
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

    return res.json({
      ok: true,
      count: streams.length,
      data: streamListWithCaptureMeta(streams, device_id, req),
    });
  } catch (err) {
    logger.error('GET /image-streams/:device_id/history error', {
      error: err.message || String(err),
    });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
