/**
 * src/server.js
 * Express server for ENIGMA backend.
 */
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const config = require('./config');
const logger = require('./logger');
const entropyRoutes = require('./routes/entropy');
const imageStreamRoutes = require('./routes/imageStreams');
const systemRoutes = require('./routes/system');
const agentRoutes = require('./routes/agentRoutes');
const { startRetryWorker } = require('./services/blockchain');
const { startBlockchainAgent } = require('./services/blockchainAgent');
const { createWebSocketServer } = require('./websocket');
const entropyService = require('./services/entropyService');

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '15mb' }));

app.use('/api/v1/entropy', entropyRoutes);
app.use('/api/v1/image-streams', imageStreamRoutes);
app.use('/api/v1/system', systemRoutes);
app.use('/api/agent', agentRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message || String(err) });
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const PORT = config.port || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  
  // Attach Socket.IO
  const io = createWebSocketServer(server);
  entropyService.setIO(io);
  
  startRetryWorker();
  startBlockchainAgent().catch((err) => {
    logger.error('[AGENT] Failed to start blockchain agent', {
      error: err.message || String(err),
    });
  });
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
