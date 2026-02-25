/**
 * src/config.js
 * Central configuration – reads from environment variables.
 */
'use strict';

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    connectionString: process.env.DATABASE_URL ||
      'postgresql://enigma:changeme@localhost:5432/enigma_db',
    max: 20,                 // pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map(s => s.trim()),
  },

  security: {
    maxTimestampSkewSeconds: parseInt(
      process.env.MAX_TIMESTAMP_SKEW_S || '60', 10),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  },

  metrics: {
    enabled: process.env.ENABLE_METRICS === 'true',
  },

  ws: {
    transports: (process.env.WS_TRANSPORTS || 'websocket,polling').split(','),
  },
};
