/**
 * src/index.js
 * ENIGMA Backend – application entry point.
 *
 * Boots Express + Socket.IO server with:
 *   - Helmet security headers
 *   - CORS configured from environment
 *   - Rate limiting
 *   - JSON body parser
 *   - /api/v1/entropy  REST routes
 *   - /metrics         (optional Prometheus)
 *   - WebSocket server
 */
'use strict';

const http           = require('http');
const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');

const config         = require('./config');
const logger         = require('./logger');
const metrics        = require('./metrics');
const entropyRouter  = require('./routes/entropy');
const { createWebSocketServer } = require('./websocket/index');
const entropyService = require('./services/entropyService');

/* ── App ─────────────────────────────────────────────────────────────── */
const app = express();

app.set('trust proxy', 1);   /* trust Nginx / Docker gateway */

/* Security headers */
app.use(helmet());

/* CORS */
app.use(cors({
  origin: config.cors.origins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* Rate limiting */
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => {
    logger.warn('Rate limit exceeded');
    res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: 'Too many requests' });
  },
}));

/* Body parser */
app.use(express.json({ limit: '64kb' }));

/* ── Health check ─────────────────────────────────────────────────────── */
app.get('/health', (_req, res) => res.json({ ok: true, service: 'enigma-backend' }));

/* ── Prometheus metrics ───────────────────────────────────────────────── */
if (config.metrics.enabled) {
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });
  logger.info('Prometheus metrics enabled at /metrics');
}

/* ── API routes ───────────────────────────────────────────────────────── */
app.use('/api/v1/entropy', entropyRouter);

/* 404 fallback */
app.use((_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND' }));

/* Global error handler */
app.use((err, _req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
});

/* ── HTTP + WebSocket server ──────────────────────────────────────────── */
const httpServer = http.createServer(app);
const io         = createWebSocketServer(httpServer);

/* Inject Socket.IO instance into the entropy service */
entropyService.setIO(io);

/* ── Start ────────────────────────────────────────────────────────────── */
httpServer.listen(config.port, () => {
  logger.info(`ENIGMA backend listening on port ${config.port}`, {
    env:  config.nodeEnv,
    cors: config.cors.origins,
  });
});

/* Graceful shutdown */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received – shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received – shutting down gracefully');
  httpServer.close(() => process.exit(0));
});

module.exports = { app, httpServer };
