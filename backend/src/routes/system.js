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
const { getDeviceStatuses, forceDeviceStatus } = require('../services/entropyService');

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
          (SELECT rtc_time FROM entropy_records WHERE device_id = d.device_id ORDER BY created_at DESC LIMIT 1) as rtc_time,
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

    /* Watchdog map: device_id → { online } (source of truth for live state) */
    const watchdogMap = new Map(
      getDeviceStatuses().map(({ device_id, online }) => [device_id, online])
    );

    const devices = deviceRes.rows.map(d => {
      // Only trust the in-memory watchdog; no DB-time fallback so a fresh
      // backend restart always shows devices as offline until they heartbeat.
      const online = watchdogMap.get(d.device_id) === true;
      return {
        device_id:    d.device_id,
        last_seen:    d.last_seen,
        first_seen:   d.first_seen,
        record_count: d.record_count,
        rtc_time:     d.rtc_time,
        online,
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

/* ── POST /api/v1/system/device-status ───────────────────────────────────
 * Called by the Windows COM port monitor (tools/com_monitor.py) whenever
 * an ESP32 device is physically plugged or unplugged.
 * Body: { device_id, online: true|false, com_port: "COM7", rtc_time?: "HH:MM:SS" }
 * ──────────────────────────────────────────────────────────────────────── */
router.post('/device-status', (req, res) => {
  const { device_id, online, com_port, rtc_time } = req.body;

  if (!device_id || typeof online !== 'boolean') {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'device_id (string) and online (boolean) are required',
    });
  }

  forceDeviceStatus(device_id, online, com_port || null, rtc_time || null);

  logger.info('Device status forced via COM monitor', { device_id, online, com_port, rtc_time });
  return res.json({ ok: true, device_id, online });
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
/* ── GET /api/v1/system/trng-status ──────────────────────────────────────
 * Returns the current TRNG pipeline state.
 * { ok, data: { state: 'inactive'|'active'|'suspended', pipeline: [...] } }
 * ─────────────────────────────────────────────────────────────────────────── */
router.get('/trng-status', (_req, res) => {
  const { getTRNGStatus } = require('../services/entropyService');
  return res.json({ ok: true, data: getTRNGStatus() });
});
/* ── GET /api/v1/system/blockchain-config ───────────────────────────── */
router.get('/blockchain-config', (_req, res) => {
  const { blockchain } = require('../config');
  return res.json({
    ok: true,
    data: {
      contractAddress: blockchain.contractAddress,
      enabled: blockchain.enabled,
      // Shared ABI for frontend
      abi: [
        'function getRecordCount() external view returns (uint256)',
        'function records(string) external view returns (string deviceId, uint256 timestamp, string entropyHash, uint256 blockNumber)',
        'event RecordAnchored(string indexed deviceId, uint256 indexed timestamp, string entropyHash, uint256 blockNumber)'
      ]
    }
  });
});

module.exports = router;
