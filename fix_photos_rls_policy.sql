-- Fix job_photos RLS policy to match existing working policies
-- Run this SQL in your Supabase SQL editor

-- Drop the existing policy that uses current_setting directly
DROP POLICY IF EXISTS "Users can access job photos for their org" ON job_photos;

-- Create new policy using the current_org_id() function like other tables
CREATE POLICY "job_photos_org_isolation" ON job_photos
  FOR ALL
  USING (org_id = current_org_id());

-- Also fix the other new table policies to be consistent
DROP POLICY IF EXISTS "Users can access job hours for their org" ON job_hours;
CREATE POLICY "job_hours_org_isolation" ON job_hours
  FOR ALL
  USING (org_id = current_org_id());

DROP POLICY IF EXISTS "Users can access job parts for their org" ON job_parts;
CREATE POLICY "job_parts_org_isolation" ON job_parts
  FOR ALL
  USING (org_id = current_org_id());

DROP POLICY IF EXISTS "Users can access job notes for their org" ON job_notes;
CREATE POLICY "job_notes_org_isolation" ON job_notes
  FOR ALL
  USING (org_id = current_org_id());

-- Fix job_assignments policy too
DROP POLICY IF EXISTS "Users can access job assignments for their org" ON job_assignments;
CREATE POLICY "job_assignments_org_isolation" ON job_assignments
  FOR ALL
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE org_id = current_org_id()
    )
  );

-- Verify the policies were created correctly
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies 
WHERE tablename IN ('job_photos', 'job_hours', 'job_parts', 'job_notes', 'job_assignments')
ORDER BY tablename, policyname;