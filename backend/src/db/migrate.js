/**
 * src/db/migrate.js
 * Run once to create required tables.
 * Usage:  node src/db/migrate.js
 */
'use strict';

require('dotenv').config();
const pool   = require('./pool');
const logger = require('../logger');

const SQL = `
-- ── Extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Devices table (public key registry) ──────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    device_id   TEXT        PRIMARY KEY,
    public_key  TEXT        NOT NULL,           -- hex-encoded uncompressed key
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Entropy records ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entropy_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT        NOT NULL REFERENCES devices(device_id),
    timestamp       BIGINT      NOT NULL,        -- UNIX epoch seconds
    entropy_hash    TEXT        NOT NULL,         -- 64-char hex SHA-256
    signature       TEXT        NOT NULL,         -- 128-char hex ECDSA r||s
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entropy_device_id  ON entropy_records (device_id);
CREATE INDEX IF NOT EXISTS idx_entropy_created_at ON entropy_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entropy_timestamp  ON entropy_records (timestamp DESC);

-- ── Unique constraint: prevent replay attacks ──────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_entropy_replay_guard
    ON entropy_records (device_id, timestamp, entropy_hash);
`;

async function migrate() {
  logger.info('Running database migrations...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    logger.info('Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', { error: err.message });
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
