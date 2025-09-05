-- Simple job_equipment table creation (policy already exists)
-- Run this SQL in your Supabase SQL editor

-- Create job_equipment table (simple version)
CREATE TABLE IF NOT EXISTS job_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    equipment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (policy already exists)
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON job_equipment TO authenticated;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_job_equipment_job_id ON job_equipment(job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_equipment_id ON job_equipment(equipment_id);

-- Quick verification
SELECT 'job_equipment table created successfully' as status;