/**
 * src/routes/system.js
 * System/hardware status routes for the TRNG dashboard.
 *
 * GET  /api/v1/system/status   – full system + device status
 * GET  /api/v1/system/uptime   – quick uptime check
 */
'use strict';

const express = require('express');
const os      = require('os');
const router  = express.Router();
const pool    = require('../db/pool');
const logger  = require('../logger');

/* Track service start time */
const SERVICE_START = Date.now();

/* ── GET /api/v1/system/status ────────────────────────────────────────── */
router.get('/status', async (_req, res) => {
  try {
    const [countRes, deviceRes, rateRes, recentRes] = await Promise.all([
      /* total + verified record count */
      pool.query(`
        SELECT
          COUNT(*)::int                                         AS total,
          COUNT(*) FILTER (WHERE signature IS NOT NULL)::int   AS verified
        FROM entropy_records
      `),
      /* per-device stats */
      pool.query(`
        SELECT
          d.device_id,
          d.last_seen,
          d.first_seen,
          d.public_key,
          COUNT(e.id)::int AS record_count
        FROM devices d
        LEFT JOIN entropy_records e ON e.device_id = d.device_id
        GROUP BY d.device_id, d.last_seen, d.first_seen, d.public_key
        ORDER BY d.last_seen DESC
      `),
      /* records per minute (last 60 s) */
      pool.query(`
        SELECT COUNT(*)::int AS recent
        FROM entropy_records
        WHERE created_at > NOW() - INTERVAL '60 seconds'
      `),
      /* last 5 records for pipeline feed */
      pool.query(`
        SELECT id, device_id, timestamp, entropy_hash, signature, created_at
        FROM entropy_records
        ORDER BY created_at DESC
        LIMIT 5
      `),
    ]);

    const now        = Date.now();
    const uptimeSec  = Math.floor((now - SERVICE_START) / 1000);
    const memUsage   = process.memoryUsage();

    const devices = deviceRes.rows.map(d => {
      const lastSeenMs = d.last_seen ? new Date(d.last_seen).getTime() : 0;
      return {
        device_id:    d.device_id,
        last_seen:    d.last_seen,
        first_seen:   d.first_seen,
        record_count: d.record_count,
        /* online = last submission within 30 s */
        online: (now - lastSeenMs) < 30_000,
        /* public_key length as a proxy for key presence */
        has_key: Boolean(d.public_key),
      };
    });

    return res.json({
      ok: true,
      data: {
        uptime:          uptimeSec,
        totalRecords:    countRes.rows[0].total,
        verifiedRecords: countRes.rows[0].verified,
        recentRate:      rateRes.rows[0].recent,   /* per last 60 s */
        activeDevices:   devices.filter(d => d.online).length,
        devices,
        recentRecords:   recentRes.rows,
        system: {
          platform:    os.platform(),
          nodeVersion: process.version,
          memory: {
            usedMB:  Math.round(memUsage.heapUsed  / 1024 / 1024),
            totalMB: Math.round(os.totalmem()       / 1024 / 1024),
            rss:     Math.round(memUsage.rss        / 1024 / 1024),
          },
          load:        parseFloat(os.loadavg()[0].toFixed(2)),
          cpuCount:    os.cpus().length,
        },
      },
    });
  } catch (err) {
    logger.error('GET /system/status error', { error: err.message || String(err) });
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: err.message });
  }
});

/* ── GET /api/v1/system/uptime ────────────────────────────────────────── */
router.get('/uptime', (_req, res) => {
  const sec = Math.floor((Date.now() - SERVICE_START) / 1000);
  const h   = Math.floor(sec / 3600);
  const m   = Math.floor((sec % 3600) / 60);
  const s   = sec % 60;
  return res.json({
    ok: true,
    data: { uptimeSeconds: sec, formatted: `${h}h ${m}m ${s}s` },
  });
});

module.exports = router;
