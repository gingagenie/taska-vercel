-- Create the missing job_charges table for billing/charging functionality
-- Run this SQL in your Supabase SQL editor

-- Create job_charges table
CREATE TABLE IF NOT EXISTS job_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL DEFAULT 'labour', -- 'labour', 'parts', 'travel', etc.
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Row Level Security
ALTER TABLE job_charges ENABLE ROW LEVEL SECURITY;

-- Create RLS policy consistent with other tables
CREATE POLICY "job_charges_org_isolation" ON job_charges
  FOR ALL
  USING (org_id = current_org_id());

-- Grant permissions
GRANT ALL ON job_charges TO authenticated;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_job_charges_job_id ON job_charges(job_id);
CREATE INDEX IF NOT EXISTS idx_job_charges_org_id ON job_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_job_charges_kind ON job_charges(kind);

-- Also create completed_job_charges table for completed job billing data
CREATE TABLE IF NOT EXISTS completed_job_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completed_job_id UUID NOT NULL REFERENCES completed_jobs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL DEFAULT 'labour',
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS for completed charges table
ALTER TABLE completed_job_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "completed_job_charges_org_isolation" ON completed_job_charges
  FOR ALL
  USING (org_id = current_org_id());

-- Grant permissions
GRANT ALL ON completed_job_charges TO authenticated;

-- Add indexes for completed charges
CREATE INDEX IF NOT EXISTS idx_completed_job_charges_completed_job_id ON completed_job_charges(completed_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_charges_original_job_id ON completed_job_charges(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_charges_org_id ON completed_job_charges(org_id);

-- Verify both tables were created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name IN ('job_charges', 'completed_job_charges')
ORDER BY table_name, ordinal_position;