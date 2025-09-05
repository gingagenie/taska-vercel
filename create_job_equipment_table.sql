-- Create the final missing job_equipment table for job-equipment relationships
-- Run this SQL in your Supabase SQL editor

-- Create job_equipment table (matching the expected schema from the code)
CREATE TABLE IF NOT EXISTS job_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    equipment_id TEXT, -- Store as text since equipment table doesn't exist
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Row Level Security
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;

-- Create RLS policy using job relationship (since no direct org_id)
CREATE POLICY "job_equipment_org_isolation" ON job_equipment
  FOR ALL
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE org_id = current_org_id()
    )
  );

-- Grant permissions
GRANT ALL ON job_equipment TO authenticated;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_job_equipment_job_id ON job_equipment(job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_equipment_id ON job_equipment(equipment_id);

-- Verify the table was created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'job_equipment'
ORDER BY ordinal_position;