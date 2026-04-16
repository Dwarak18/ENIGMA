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
    entropy_hash    TEXT        NOT NULL,        -- 64-char hex SHA-256
    signature       TEXT        NOT NULL,        -- 128-char hex ECDSA r||s
    aes_ciphertext  TEXT,                        -- 32-char hex AES-256-CBC ciphertext
    aes_iv          TEXT,                        -- 32-char hex AES IV (16 bytes)
    rtc_time        TEXT,                        -- "HH:MM:SS" IST from device DS3231
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

  -- ── Blockchain retry queue ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pending_blockchain (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT        NOT NULL REFERENCES devices(device_id),
    timestamp       BIGINT      NOT NULL,
    entropy_hash    TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending',
    retry_count     INTEGER     NOT NULL DEFAULT 0,
    tx_hash         TEXT,
    last_error      TEXT,
    next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ── AES + RTC columns (idempotent – safe to re-run on older schemas) ────
ALTER TABLE entropy_records ADD COLUMN IF NOT EXISTS aes_ciphertext TEXT;
ALTER TABLE entropy_records ADD COLUMN IF NOT EXISTS aes_iv         TEXT;
ALTER TABLE entropy_records ADD COLUMN IF NOT EXISTS rtc_time       TEXT;

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entropy_device_id      ON entropy_records (device_id);
CREATE INDEX IF NOT EXISTS idx_entropy_device_created ON entropy_records (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entropy_created_at     ON entropy_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entropy_timestamp      ON entropy_records (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pending_blockchain_retry
  ON pending_blockchain (status, next_retry_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_blockchain_record
  ON pending_blockchain (device_id, timestamp, entropy_hash);

-- ── Unique constraint: prevent replay attacks ──────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_entropy_replay_guard
    ON entropy_records (device_id, timestamp, entropy_hash);

-- ── Convenience view ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW entropy_feed AS
    SELECT
        er.id,
        er.device_id,
        er.timestamp,
        er.entropy_hash,
        er.signature,
        er.aes_ciphertext,
        er.aes_iv,
        er.rtc_time,
        er.created_at,
        d.public_key
    FROM entropy_records er
    JOIN devices d USING (device_id)
    ORDER BY er.created_at DESC;
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
