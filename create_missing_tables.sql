-- Create missing database tables for Taska
-- Run this SQL in your Supabase SQL editor

-- First, drop the table if it exists but is incomplete
DROP TABLE IF EXISTS job_assignments CASCADE;

-- 1. Job assignments table (for technician assignments)
CREATE TABLE job_assignments (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (job_id, user_id)
);

-- Drop and recreate other tables that might be incomplete
DROP TABLE IF EXISTS job_photos CASCADE;
DROP TABLE IF EXISTS job_hours CASCADE;
DROP TABLE IF EXISTS job_parts CASCADE;
DROP TABLE IF EXISTS job_notes CASCADE;

-- 2. Job photos table (for photo uploads)
CREATE TABLE job_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES orgs(id),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Job hours tracking table (for time tracking)
CREATE TABLE job_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    hours DECIMAL(4,1) NOT NULL, -- e.g., 1.5, 2.0, 0.5
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Job parts table (for parts tracking)
CREATE TABLE job_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Job notes table (for additional job notes)
CREATE TABLE job_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Job equipment table (for equipment assignments) - if not exists
CREATE TABLE IF NOT EXISTS job_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES equipment(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS (Row Level Security) policies for multi-tenancy

-- Job assignments RLS
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job assignments for their org" ON job_assignments
    FOR ALL USING (
        job_id IN (
            SELECT id FROM jobs WHERE org_id = current_setting('app.current_org')::UUID
        )
    );

-- Job photos RLS  
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job photos for their org" ON job_photos
    FOR ALL USING (org_id = current_setting('app.current_org')::UUID);

-- Job hours RLS
ALTER TABLE job_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job hours for their org" ON job_hours
    FOR ALL USING (org_id = current_setting('app.current_org')::UUID);

-- Job parts RLS
ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job parts for their org" ON job_parts
    FOR ALL USING (org_id = current_setting('app.current_org')::UUID);

-- Job notes RLS
ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job notes for their org" ON job_notes
    FOR ALL USING (org_id = current_setting('app.current_org')::UUID);

-- Job equipment RLS (if table was created)
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access job equipment for their org" ON job_equipment
    FOR ALL USING (
        job_id IN (
            SELECT id FROM jobs WHERE org_id = current_setting('app.current_org')::UUID
        )
    );

-- Grant necessary permissions
GRANT ALL ON job_assignments TO authenticated;
GRANT ALL ON job_photos TO authenticated;
GRANT ALL ON job_hours TO authenticated;
GRANT ALL ON job_parts TO authenticated;
GRANT ALL ON job_notes TO authenticated;
GRANT ALL ON job_equipment TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_user_id ON job_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_job_id ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_org_id ON job_photos(org_id);
CREATE INDEX IF NOT EXISTS idx_job_hours_job_id ON job_hours(job_id);
CREATE INDEX IF NOT EXISTS idx_job_hours_org_id ON job_hours(org_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_job_id ON job_parts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_org_id ON job_parts(org_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_job_id ON job_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_org_id ON job_notes(org_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_job_id ON job_equipment(job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_equipment_id ON job_equipment(equipment_id);

-- Verify the tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('job_assignments', 'job_photos', 'job_hours', 'job_parts', 'job_notes', 'job_equipment')
ORDER BY table_name;