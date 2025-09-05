-- Create the missing completed_jobs table for job completion functionality
-- Run this SQL in your Supabase SQL editor

-- Create completed_jobs table
CREATE TABLE IF NOT EXISTS completed_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    customer_id UUID REFERENCES customers(id),
    customer_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    notes TEXT,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    completed_by UUID REFERENCES users(id),
    original_created_by UUID REFERENCES users(id),
    original_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Row Level Security
ALTER TABLE completed_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy consistent with other tables
CREATE POLICY "completed_jobs_org_isolation" ON completed_jobs
  FOR ALL
  USING (org_id = current_org_id());

-- Grant permissions
GRANT ALL ON completed_jobs TO authenticated;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_completed_jobs_org_id ON completed_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_completed_jobs_original_job_id ON completed_jobs(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_jobs_customer_id ON completed_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_completed_jobs_completed_at ON completed_jobs(completed_at);

-- Verify the table was created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'completed_jobs'
ORDER BY ordinal_position;