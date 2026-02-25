-- =============================================================================
-- ENIGMA Database Schema
-- Engine: PostgreSQL 15+
-- Run: psql -U postgres -d enigma_db -f schema.sql
-- =============================================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Table: devices
-- Stores registered edge devices and their public keys.
-- =============================================================================
CREATE TABLE IF NOT EXISTS devices (
    device_id   TEXT         PRIMARY KEY,
    public_key  TEXT         NOT NULL,
    first_seen  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  devices              IS 'Registered ENIGMA edge devices';
COMMENT ON COLUMN devices.device_id   IS 'Unique device identifier (e.g. esp32-001)';
COMMENT ON COLUMN devices.public_key  IS 'Hex-encoded uncompressed secp256r1 public key (130 chars)';
COMMENT ON COLUMN devices.first_seen  IS 'Timestamp of first payload received from this device';
COMMENT ON COLUMN devices.last_seen   IS 'Timestamp of most recent payload from this device';

-- =============================================================================
-- Table: entropy_records
-- Stores validated, signed entropy submissions.
-- =============================================================================
CREATE TABLE IF NOT EXISTS entropy_records (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id     TEXT         NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    timestamp     BIGINT       NOT NULL,   -- UNIX epoch seconds (from device clock)
    entropy_hash  TEXT         NOT NULL,   -- 64-char hex SHA-256 digest
    signature     TEXT         NOT NULL,   -- 128-char hex raw ECDSA r||s
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  entropy_records              IS 'Validated entropy submissions from edge devices';
COMMENT ON COLUMN entropy_records.id           IS 'Server-generated UUID for this record';
COMMENT ON COLUMN entropy_records.device_id    IS 'FK to devices table';
COMMENT ON COLUMN entropy_records.timestamp    IS 'UNIX epoch seconds reported by the device';
COMMENT ON COLUMN entropy_records.entropy_hash IS 'SHA-256(entropy_bytes || timestamp_le8) in hex';
COMMENT ON COLUMN entropy_records.signature    IS 'Raw ECDSA secp256r1 signature r||s in hex';
COMMENT ON COLUMN entropy_records.created_at   IS 'Server-side insertion timestamp';

-- =============================================================================
-- Indexes
-- =============================================================================

-- Most common query: latest records per device
CREATE INDEX IF NOT EXISTS idx_entropy_device_created
    ON entropy_records (device_id, created_at DESC);

-- Sorted feed for frontend
CREATE INDEX IF NOT EXISTS idx_entropy_created_at
    ON entropy_records (created_at DESC);

-- Device timestamp ordering
CREATE INDEX IF NOT EXISTS idx_entropy_timestamp
    ON entropy_records (timestamp DESC);

-- =============================================================================
-- Unique constraint: replay-attack prevention
-- A device cannot submit the same (timestamp, hash) pair twice.
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_entropy_replay_guard
    ON entropy_records (device_id, timestamp, entropy_hash);

-- =============================================================================
-- View: entropy_feed  (convenience for frontend queries)
-- =============================================================================
CREATE OR REPLACE VIEW entropy_feed AS
    SELECT
        er.id,
        er.device_id,
        er.timestamp,
        er.entropy_hash,
        er.signature,
        er.created_at,
        d.public_key
    FROM entropy_records er
    JOIN devices d USING (device_id)
    ORDER BY er.created_at DESC;

COMMENT ON VIEW entropy_feed IS 'Enriched entropy records joined with device public key';
