--
-- Add blockchain agent fields to image_proofs table
--
ALTER TABLE image_proofs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'submitted', 'confirmed', 'failed')),
  ADD COLUMN IF NOT EXISTS tx_confirmed_block BIGINT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- Index for agent polling query
CREATE INDEX IF NOT EXISTS idx_agent_poll
  ON image_proofs(status, created_at)
  WHERE tx_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_confirm
  ON image_proofs(status, created_at)
  WHERE status = 'submitted';