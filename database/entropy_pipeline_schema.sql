-- =============================================================================
-- ENTROPY PIPELINE DATABASE SCHEMA
-- Engine: PostgreSQL 15+
-- 
-- This schema supports the deterministic entropy pipeline with multi-layer
-- validation, blockchain anchoring, and verification.
-- 
-- CRITICAL RULES:
-- - NEVER store raw entropy
-- - NEVER store raw AES keys
-- - Store ONLY hashes and metadata
-- - All timestamps use TIMESTAMPTZ for timezone safety
-- =============================================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Table: entropy_pipeline
-- 
-- Stores validated entropy records from the camera → blockchain pipeline
-- 
-- This is the PRIMARY RECORD for the deterministic entropy pipeline.
-- Every record represents one complete entropy capture from the frontend.
-- =============================================================================
CREATE TABLE IF NOT EXISTS entropy_pipeline (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           TEXT         NOT NULL,
    frame_id            UUID         NOT NULL UNIQUE,
    entropy_hash        TEXT         NOT NULL,        -- SHA-256 of raw entropy (hex, 64 chars)
    aes_key_hash        TEXT,                         -- SHA-256 of AES key (hex, 64 chars)
    frame_count         INTEGER      NOT NULL,        -- Number of camera frames captured
    capture_duration_ms INTEGER      NOT NULL,        -- Actual capture duration in milliseconds
    captured_at         TIMESTAMPTZ  NOT NULL,        -- Frontend capture start timestamp
    stored_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status              TEXT         NOT NULL DEFAULT 'received',
                                                      -- received → encrypted → anchored → verified
    blockchain_hash     TEXT,                         -- SHA256(aes_key_hash || frame_id || sntp_time)
    blockchain_tx_hash  TEXT,                         -- Hardhat transaction hash
    blockchain_confirmed_at TIMESTAMPTZ,              -- When blockchain confirmed
    notes               TEXT
);

COMMENT ON TABLE entropy_pipeline IS 'Deterministic entropy pipeline records: camera → backend → blockchain';
COMMENT ON COLUMN entropy_pipeline.frame_id IS 'Unique frame identifier from frontend (UUID)';
COMMENT ON COLUMN entropy_pipeline.entropy_hash IS 'SHA-256 of raw captured entropy (never store raw entropy)';
COMMENT ON COLUMN entropy_pipeline.aes_key_hash IS 'SHA-256 of AES key used for encryption';
COMMENT ON COLUMN entropy_pipeline.status IS 'Pipeline stage: received, encrypted, anchored, verified';
COMMENT ON COLUMN entropy_pipeline.blockchain_hash IS 'Final anchor hash on blockchain: SHA256(aes_key_hash || frame_id || sntp_time)';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entropy_pipeline_device_id
    ON entropy_pipeline (device_id, stored_at DESC);

CREATE INDEX IF NOT EXISTS idx_entropy_pipeline_frame_id
    ON entropy_pipeline (frame_id);

CREATE INDEX IF NOT EXISTS idx_entropy_pipeline_status
    ON entropy_pipeline (status, stored_at DESC);

CREATE INDEX IF NOT EXISTS idx_entropy_pipeline_blockchain_hash
    ON entropy_pipeline (blockchain_hash);

-- Unique constraint: prevent duplicate entropy from same frame
CREATE UNIQUE INDEX IF NOT EXISTS idx_entropy_pipeline_frame_unique
    ON entropy_pipeline (frame_id);

-- =============================================================================
-- Table: entropy_verification_log
-- 
-- Audit trail for all verification attempts
-- Used for detecting tampering, tracking failures, and security audits
-- =============================================================================
CREATE TABLE IF NOT EXISTS entropy_verification_log (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    entropy_id          UUID         NOT NULL REFERENCES entropy_pipeline(id) ON DELETE CASCADE,
    verification_type   TEXT         NOT NULL,    -- 'hash_match', 'blockchain', 'full_audit'
    verified            BOOLEAN      NOT NULL,
    details             JSONB,                    -- Extra verification metadata
    verified_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE entropy_verification_log IS 'Audit trail of all verification attempts';

CREATE INDEX IF NOT EXISTS idx_entropy_verification_log_entropy_id
    ON entropy_verification_log (entropy_id, verified_at DESC);

-- =============================================================================
-- Table: entropy_error_log
-- 
-- Log of errors at each pipeline stage for debugging and analytics
-- =============================================================================
CREATE TABLE IF NOT EXISTS entropy_error_log (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           TEXT,
    frame_id            UUID,
    pipeline_stage      TEXT         NOT NULL,   -- 'capture', 'validation', 'storage', 'encryption', 'blockchain'
    error_code          TEXT         NOT NULL,
    error_message       TEXT,
    details             JSONB,
    occurred_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE entropy_error_log IS 'Error tracking for pipeline debugging';

CREATE INDEX IF NOT EXISTS idx_entropy_error_log_device_id
    ON entropy_error_log (device_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_entropy_error_log_stage
    ON entropy_error_log (pipeline_stage, occurred_at DESC);

-- =============================================================================
-- Table: capture_records (Optional: for frame storage metadata)
-- 
-- Links captured frames to entropy records
-- IMPORTANT: Stores frame metadata ONLY, not frame data
-- =============================================================================
CREATE TABLE IF NOT EXISTS capture_records (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    entropy_id          UUID         REFERENCES entropy_pipeline(id) ON DELETE CASCADE,
    frame_number        INTEGER      NOT NULL,   -- Sequential frame index (0-based)
    grayscale_hash      TEXT,                    -- SHA-256 of grayscale frame data
    difference_hash     TEXT,                    -- SHA-256 of differences from previous frame
    stored_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE capture_records IS 'Per-frame metadata for entropy capture';

CREATE INDEX IF NOT EXISTS idx_capture_records_entropy_id
    ON capture_records (entropy_id, frame_number);

-- =============================================================================
-- Stored Procedure: validate_entropy_pipeline_integrity
-- 
-- Comprehensive validation function for integrity audits
-- Returns: { valid: boolean, issues: [] }
-- =============================================================================
CREATE OR REPLACE FUNCTION validate_entropy_pipeline_integrity(
    p_entropy_id UUID
)
RETURNS TABLE (
    valid BOOLEAN,
    issues TEXT[]
) AS $$
DECLARE
    v_record entropy_pipeline%ROWTYPE;
    v_issues TEXT[] := ARRAY[]::TEXT[];
    v_blockchain_valid BOOLEAN;
BEGIN
    SELECT * INTO v_record FROM entropy_pipeline WHERE id = p_entropy_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, ARRAY['Record not found'];
        RETURN;
    END IF;
    
    -- Check 1: entropy_hash is valid hex
    IF v_record.entropy_hash !~ '^[a-f0-9]{64}$' THEN
        v_issues := v_issues || ARRAY['entropy_hash is not valid 64-char hex'];
    END IF;
    
    -- Check 2: aes_key_hash is valid hex (if present)
    IF v_record.aes_key_hash IS NOT NULL AND v_record.aes_key_hash !~ '^[a-f0-9]{64}$' THEN
        v_issues := v_issues || ARRAY['aes_key_hash is not valid 64-char hex'];
    END IF;
    
    -- Check 3: blockchain_hash is valid hex (if present)
    IF v_record.blockchain_hash IS NOT NULL AND v_record.blockchain_hash !~ '^[a-f0-9]{64}$' THEN
        v_issues := v_issues || ARRAY['blockchain_hash is not valid 64-char hex'];
    END IF;
    
    -- Check 4: status is valid
    IF v_record.status NOT IN ('received', 'encrypted', 'anchored', 'verified', 'failed') THEN
        v_issues := v_issues || ARRAY['Invalid status: ' || v_record.status];
    END IF;
    
    -- Check 5: timestamps are consistent
    IF v_record.stored_at < v_record.captured_at THEN
        v_issues := v_issues || ARRAY['stored_at is before captured_at'];
    END IF;
    
    -- Check 6: capture_duration_ms is reasonable (8-12 seconds for 10s capture)
    IF v_record.capture_duration_ms < 8000 OR v_record.capture_duration_ms > 12000 THEN
        v_issues := v_issues || ARRAY['capture_duration_ms out of acceptable range (8-12 seconds)'];
    END IF;
    
    -- Check 7: frame_count is reasonable (90-110 frames for 10 FPS over 10s)
    IF v_record.frame_count < 90 OR v_record.frame_count > 110 THEN
        v_issues := v_issues || ARRAY['frame_count out of expected range (90-110)'];
    END IF;
    
    RETURN QUERY SELECT 
        (v_issues = ARRAY[]::TEXT[])::BOOLEAN,
        v_issues;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_entropy_pipeline_integrity(UUID) IS 
    'Validates entropy pipeline record integrity, returns issues array if problems found';

-- =============================================================================
-- View: entropy_pipeline_status
-- 
-- High-level view of pipeline status for monitoring/dashboards
-- =============================================================================
CREATE OR REPLACE VIEW entropy_pipeline_status AS
SELECT
    date_trunc('hour', ep.stored_at) as hour,
    COUNT(*) as total_records,
    COUNT(CASE WHEN ep.status = 'received' THEN 1 END) as received_count,
    COUNT(CASE WHEN ep.status = 'encrypted' THEN 1 END) as encrypted_count,
    COUNT(CASE WHEN ep.status = 'anchored' THEN 1 END) as anchored_count,
    COUNT(CASE WHEN ep.status = 'verified' THEN 1 END) as verified_count,
    COUNT(CASE WHEN ep.blockchain_hash IS NOT NULL THEN 1 END) as blockchain_anchored,
    AVG(ep.capture_duration_ms) as avg_capture_duration_ms,
    AVG(ep.frame_count) as avg_frame_count
FROM entropy_pipeline ep
GROUP BY date_trunc('hour', ep.stored_at)
ORDER BY hour DESC;

COMMENT ON VIEW entropy_pipeline_status IS 'Hourly summary of entropy pipeline statistics';

-- =============================================================================
-- View: entropy_unverified
-- 
-- Find records that need verification
-- =============================================================================
CREATE OR REPLACE VIEW entropy_unverified AS
SELECT
    ep.id,
    ep.frame_id,
    ep.device_id,
    ep.status,
    ep.stored_at,
    CASE
        WHEN ep.status = 'received' THEN 'Awaiting encryption'
        WHEN ep.status = 'encrypted' THEN 'Awaiting blockchain anchor'
        WHEN ep.status = 'anchored' THEN 'Awaiting verification'
        ELSE 'Unknown'
    END as next_step
FROM entropy_pipeline ep
WHERE ep.status != 'verified'
ORDER BY ep.stored_at DESC;

COMMENT ON VIEW entropy_unverified IS 'Records requiring further processing';

-- =============================================================================
-- Data Migration: Add entropy_pipeline to existing ENIGMA databases
-- 
-- This is IDEMPOTENT and safe to re-run multiple times
-- =============================================================================
-- Tables created above are already "IF NOT EXISTS", so they won't conflict

-- Ensure extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- FINAL VALIDATION
-- =============================================================================
-- Verify schema was created correctly
SELECT 'entropy_pipeline schema successfully created' as status
WHERE EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'entropy_pipeline');
