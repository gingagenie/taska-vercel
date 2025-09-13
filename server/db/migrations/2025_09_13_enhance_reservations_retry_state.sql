-- Enhanced retry state fields for continuous background compensation processing
-- This migration adds fields needed for persistent retry tracking and billing safety

-- Add new fields for retry state management
ALTER TABLE usage_pack_reservations 
ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS compensation_required_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS original_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update original_expires_at for existing records
UPDATE usage_pack_reservations 
SET original_expires_at = expires_at, updated_at = NOW()
WHERE original_expires_at IS NULL;

-- Make original_expires_at NOT NULL after populating existing records
ALTER TABLE usage_pack_reservations 
ALTER COLUMN original_expires_at SET NOT NULL;

-- Extend status enum to include compensation_required
ALTER TABLE usage_pack_reservations 
DROP CONSTRAINT IF EXISTS reservations_status_valid;

ALTER TABLE usage_pack_reservations 
ADD CONSTRAINT reservations_status_valid 
CHECK (status IN ('pending', 'finalized', 'released', 'compensation_required'));

-- Add constraint for attempt_count
ALTER TABLE usage_pack_reservations 
ADD CONSTRAINT reservations_attempt_count_valid 
CHECK (attempt_count >= 0);

-- Create indexes for background processing efficiency
CREATE INDEX IF NOT EXISTS reservations_next_retry_idx 
ON usage_pack_reservations (next_retry_at, status) 
WHERE next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservations_compensation_idx 
ON usage_pack_reservations (status, compensation_required_at) 
WHERE status = 'compensation_required';

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_usage_pack_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at management
DROP TRIGGER IF EXISTS update_usage_pack_reservations_updated_at_trigger 
ON usage_pack_reservations;

CREATE TRIGGER update_usage_pack_reservations_updated_at_trigger
    BEFORE UPDATE ON usage_pack_reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_pack_reservations_updated_at();

COMMENT ON TABLE usage_pack_reservations IS 'Enhanced with retry state for continuous background compensation processing';
COMMENT ON COLUMN usage_pack_reservations.attempt_count IS 'Number of finalization attempts made';
COMMENT ON COLUMN usage_pack_reservations.last_error IS 'Last error message for debugging failures';
COMMENT ON COLUMN usage_pack_reservations.next_retry_at IS 'Scheduled time for next retry attempt';
COMMENT ON COLUMN usage_pack_reservations.compensation_required_at IS 'When marked for manual compensation (non-expiring)';
COMMENT ON COLUMN usage_pack_reservations.original_expires_at IS 'Original expiry time before any extensions';