/**
 * src/websocket/index.js
 * Socket.IO server setup, connection lifecycle, and periodic system broadcasts.
 */
'use strict';

const { Server } = require('socket.io');
const os         = require('os');
const pool       = require('../db/pool');
const config     = require('../config');
const logger     = require('../logger');
const metrics    = require('../metrics');
const { getDeviceStatuses } = require('../services/entropyService');

const SERVICE_START = Date.now();

/**
 * Build and emit a compact system-stats snapshot to all connected clients.
 * Called every 5 s by an interval started in createWebSocketServer.
 */
async function broadcastSystemStats(io) {
  try {
    const [countRes, deviceRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                       AS total,
          COUNT(*) FILTER (WHERE signature IS NOT NULL)::int AS verified
        FROM entropy_records
      `),
      pool.query(`
        SELECT d.device_id, d.last_seen, d.public_key, COUNT(e.id)::int AS record_count
        FROM devices d
        LEFT JOIN entropy_records e ON e.device_id = d.device_id
        GROUP BY d.device_id, d.last_seen, d.public_key
        ORDER BY d.last_seen DESC
      `),
    ]);

    const now = Date.now();

    /* Watchdog map: source of truth for live device state */
    const watchdogMap = new Map(
      getDeviceStatuses().map(({ device_id, online }) => [device_id, online])
    );

    const devices = deviceRes.rows.map(d => {
      // Only trust the in-memory watchdog; if we have no record the device is
      // offline (avoids stale DB last_seen falsely showing it connected after
      // a backend restart).
      const online = watchdogMap.get(d.device_id) === true;
      return {
        device_id:    d.device_id,
        last_seen:    d.last_seen,
        record_count: d.record_count,
        has_key:      Boolean(d.public_key),
        online,
      };
    });

    io.emit('system:stats', {
      totalRecords:    countRes.rows[0].total,
      verifiedRecords: countRes.rows[0].verified,
      activeDevices:   devices.filter(d => d.online).length,
      devices,
      uptime:          Math.floor((now - SERVICE_START) / 1000),
      trng:            getTRNGStatus(),
      system: {
        platform:    os.platform(),
        nodeVersion: process.version,
        cpuCount:    os.cpus().length,
        load:        parseFloat(os.loadavg()[0].toFixed(2)),
        memory: {
          usedMB:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          totalMB: Math.round(os.totalmem() / 1024 / 1024),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('broadcastSystemStats error', { error: err.message || String(err) });
  }
}

/**
 * Attach Socket.IO to an existing HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function createWebSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
    },
    transports: config.ws.transports,
  });

  /* ── Periodic system-stats broadcast ─────────────────────────────── */
  const statsInterval = setInterval(() => broadcastSystemStats(io), 5000);
  /* Clean up on server close */
  httpServer.on('close', () => clearInterval(statsInterval));

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for']
                  || socket.handshake.address;

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      ip: clientIp,
    });
    metrics.wsConnections.inc();

    /* Send a fresh stats snapshot immediately on connect */
    broadcastSystemStats(io);

    /* Push current device online/offline states + TRNG state to new client */
    for (const { device_id, online } of getDeviceStatuses()) {
      socket.emit('device:status', { device_id, online, last_seen: null, ts: Date.now() });
    }
    socket.emit('trng:state', { ...getTRNGStatus(), ts: Date.now() });

    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        reason,
      });
      metrics.wsConnections.dec();
    });

    /* Client requests last N entropy records */
    socket.on('entropy:fetch_history', async ({ limit = 20 } = {}) => {
      try {
        const { getHistory } = require('../services/entropyService');
        const records = await getHistory(Math.min(limit, 100));
        socket.emit('entropy:history', records);
      } catch (err) {
        logger.error('entropy:fetch_history error', { error: err.message || String(err) });
      }
    });

    /* Client requests a single record by id or entropy_hash */
    socket.on('entropy:lookup', async ({ entropy_hash } = {}) => {
      try {
        if (!entropy_hash) { socket.emit('entropy:lookup_result', { ok: false }); return; }
        const res = await pool.query(`
          SELECT id, device_id, timestamp, entropy_hash, signature, created_at
          FROM entropy_records WHERE entropy_hash = $1
        `, [entropy_hash]);
        socket.emit('entropy:lookup_result', {
          ok:     res.rows.length > 0,
          record: res.rows[0] || null,
        });
      } catch (err) {
        logger.error('entropy:lookup error', { error: err.message || String(err) });
        socket.emit('entropy:lookup_result', { ok: false });
      }
    });
  });

  return io;
}

module.exports = { createWebSocketServer };
