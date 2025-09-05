-- Fix missing foreign key constraints for org_id fields
-- Run this SQL in your Supabase SQL editor after create_missing_tables.sql

-- Add missing foreign key constraints for org_id fields
ALTER TABLE job_hours ADD CONSTRAINT job_hours_org_id_fkey 
    FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

ALTER TABLE job_parts ADD CONSTRAINT job_parts_org_id_fkey 
    FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

ALTER TABLE job_notes ADD CONSTRAINT job_notes_org_id_fkey 
    FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- Verify all constraints were added
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN ('job_hours', 'job_parts', 'job_notes', 'job_photos', 'job_assignments')
ORDER BY tc.table_name, tc.constraint_name;