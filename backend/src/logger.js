/**
 * src/logger.js
 * Winston logger – structured JSON in production, pretty-print in dev.
 */
'use strict';

const { createLogger, format, transports } = require('winston');
const { nodeEnv } = require('./config');

const logger = createLogger({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  format: nodeEnv === 'production'
    ? format.combine(format.timestamp(), format.json())
    : format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${extra}`;
        }),
      ),
  transports: [new transports.Console()],
});

module.exports = logger;
