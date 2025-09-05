-- Create all missing completed job tables for job completion preservation
-- Run this SQL in your Supabase SQL editor

-- Create completed_job_hours table
CREATE TABLE IF NOT EXISTS completed_job_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completed_job_id UUID NOT NULL REFERENCES completed_jobs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    hours DECIMAL(4,1) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create completed_job_parts table
CREATE TABLE IF NOT EXISTS completed_job_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completed_job_id UUID NOT NULL REFERENCES completed_jobs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create completed_job_notes table
CREATE TABLE IF NOT EXISTS completed_job_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completed_job_id UUID NOT NULL REFERENCES completed_jobs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create completed_job_photos table
CREATE TABLE IF NOT EXISTS completed_job_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completed_job_id UUID NOT NULL REFERENCES completed_jobs(id) ON DELETE CASCADE,
    original_job_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Row Level Security for all completed tables
ALTER TABLE completed_job_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_job_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_job_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_job_photos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "completed_job_hours_org_isolation" ON completed_job_hours
  FOR ALL USING (org_id = current_org_id());

CREATE POLICY "completed_job_parts_org_isolation" ON completed_job_parts
  FOR ALL USING (org_id = current_org_id());

CREATE POLICY "completed_job_notes_org_isolation" ON completed_job_notes
  FOR ALL USING (org_id = current_org_id());

CREATE POLICY "completed_job_photos_org_isolation" ON completed_job_photos
  FOR ALL USING (org_id = current_org_id());

-- Grant permissions
GRANT ALL ON completed_job_hours TO authenticated;
GRANT ALL ON completed_job_parts TO authenticated;
GRANT ALL ON completed_job_notes TO authenticated;
GRANT ALL ON completed_job_photos TO authenticated;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_completed_job_hours_completed_job_id ON completed_job_hours(completed_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_hours_original_job_id ON completed_job_hours(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_hours_org_id ON completed_job_hours(org_id);

CREATE INDEX IF NOT EXISTS idx_completed_job_parts_completed_job_id ON completed_job_parts(completed_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_parts_original_job_id ON completed_job_parts(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_parts_org_id ON completed_job_parts(org_id);

CREATE INDEX IF NOT EXISTS idx_completed_job_notes_completed_job_id ON completed_job_notes(completed_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_notes_original_job_id ON completed_job_notes(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_notes_org_id ON completed_job_notes(org_id);

CREATE INDEX IF NOT EXISTS idx_completed_job_photos_completed_job_id ON completed_job_photos(completed_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_photos_original_job_id ON completed_job_photos(original_job_id);
CREATE INDEX IF NOT EXISTS idx_completed_job_photos_org_id ON completed_job_photos(org_id);

-- Verify all completed job tables were created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name LIKE 'completed_job_%'
ORDER BY table_name, ordinal_position;