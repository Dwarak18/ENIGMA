/**
 * src/metrics.js
 * Optional Prometheus metrics via prom-client.
 * Exposed at GET /metrics when ENABLE_METRICS=true.
 */
'use strict';

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const entropyReceived = new client.Counter({
  name: 'enigma_entropy_received_total',
  help: 'Total entropy submissions received',
  labelNames: ['device_id'],
  registers: [register],
});

const entropyVerified = new client.Counter({
  name: 'enigma_entropy_verified_total',
  help: 'Total entropy submissions that passed signature verification',
  labelNames: ['device_id'],
  registers: [register],
});

const entropyRejected = new client.Counter({
  name: 'enigma_entropy_rejected_total',
  help: 'Total entropy submissions rejected',
  labelNames: ['reason'],
  registers: [register],
});

const wsConnections = new client.Gauge({
  name: 'enigma_ws_connections',
  help: 'Current number of active WebSocket connections',
  registers: [register],
});

module.exports = {
  register,
  entropyReceived,
  entropyVerified,
  entropyRejected,
  wsConnections,
};
