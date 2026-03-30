/**
 * src/db/pool.js
 * Singleton pg Pool – shared across the application.
 */
'use strict';

const { Pool } = require('pg');
const config   = require('../config');
const logger   = require('../logger');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  logger.error('Unexpected pg client error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New DB connection established');
});

module.exports = pool;
