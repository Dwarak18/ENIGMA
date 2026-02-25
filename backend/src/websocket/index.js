/**
 * src/websocket/index.js
 * Socket.IO server setup and connection lifecycle logging.
 */
'use strict';

const { Server } = require('socket.io');
const config     = require('../config');
const logger     = require('../logger');
const metrics    = require('../metrics');

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

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for']
                  || socket.handshake.address;

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      ip: clientIp,
    });
    metrics.wsConnections.inc();

    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        reason,
      });
      metrics.wsConnections.dec();
    });

    /* Optional: client can request last N records on connect */
    socket.on('entropy:fetch_history', async ({ limit = 20 } = {}) => {
      try {
        const { getHistory } = require('../services/entropyService');
        const records = await getHistory(Math.min(limit, 100));
        socket.emit('entropy:history', records);
      } catch (err) {
        logger.error('entropy:fetch_history error', { error: err.message });
      }
    });
  });

  return io;
}

module.exports = { createWebSocketServer };
