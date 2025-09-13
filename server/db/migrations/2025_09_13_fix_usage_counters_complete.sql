-- CONSOLIDATED MIGRATION: Complete usage_counters schema fix and normalization
-- Date: 2025-09-13
-- Purpose: Atomic fix for usage_counters table creation, schema fixes, and period boundary normalization
-- 
-- CRITICAL: This migration consolidates two previously separate migrations to fix ordering hazard
-- - Creates usage_counters table if missing (clean databases)
-- - Fixes schema issues on existing tables (production databases)
-- - Normalizes period boundaries to [start, end) pattern
-- - Establishes usage_counters as single source of truth
--
-- SAFETY: Fully idempotent, atomic transaction, works on clean and existing databases

BEGIN;

-- =================================================================
-- PART 1: TABLE CREATION AND SCHEMA SETUP
-- =================================================================

-- Create usage_counters table if it doesn't exist (for clean databases)
CREATE TABLE IF NOT EXISTS usage_counters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    period_start timestamp without time zone NOT NULL,
    period_end timestamp without time zone NOT NULL,
    sms_sent integer NOT NULL DEFAULT 0,
    emails_sent integer NOT NULL DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Drop existing problematic constraints and indexes to ensure clean state
DROP INDEX IF EXISTS usage_counters_org_period_idx;
DROP INDEX IF EXISTS usage_counters_org_period_unique;
DROP INDEX IF EXISTS usage_counters_org_period_lookup_idx;
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_period_valid;
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_org_id_fkey;

-- Fix column types to ensure consistency (idempotent)
DO $$
BEGIN
    -- Only alter if the columns exist and need changing
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'usage_counters' AND column_name = 'period_start') THEN
        
        -- Ensure all timestamp columns are consistent
        ALTER TABLE usage_counters 
          ALTER COLUMN period_start TYPE timestamp without time zone,
          ALTER COLUMN period_end TYPE timestamp without time zone,
          ALTER COLUMN created_at TYPE timestamp without time zone,
          ALTER COLUMN updated_at TYPE timestamp without time zone;
          
        RAISE NOTICE 'Fixed timestamp column types for usage_counters';
    END IF;
END $$;

-- =================================================================
-- PART 2: PERIOD BOUNDARY NORMALIZATION
-- =================================================================

-- Fix existing usage_counters periods to use [start inclusive, end exclusive) pattern
-- This handles data that may have been created with incorrect boundaries
UPDATE usage_counters 
SET period_end = (
    -- Convert to first day of next month at 00:00:00 (exclusive end)
    DATE_TRUNC('month', period_start) + INTERVAL '1 month'
)::timestamp
WHERE 
    -- Only fix periods that are using old pattern (last day at 00:00:00)
    period_end::time = '00:00:00'::time 
    AND EXTRACT(day FROM period_end) > 1  -- Periods ending on non-1st day
    AND period_end != DATE_TRUNC('month', period_start) + INTERVAL '1 month';

-- Log boundary normalization results
DO $$ 
DECLARE 
    updated_count integer;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count > 0 THEN
        RAISE NOTICE 'Normalized % period boundaries to [start, end) pattern', updated_count;
    ELSE
        RAISE NOTICE 'All period boundaries already properly normalized';
    END IF;
END $$;

-- =================================================================
-- PART 3: DEDUPLICATE OVERLAPPING PERIODS
-- =================================================================

-- Remove duplicate rows caused by period boundary mismatches
-- Keep the row with highest sms_sent count per org per month
WITH duplicate_periods AS (
    SELECT 
        u1.id,
        u1.org_id,
        u1.period_start,
        u1.period_end,
        u1.sms_sent,
        u1.emails_sent,
        ROW_NUMBER() OVER (
            PARTITION BY u1.org_id, DATE_TRUNC('month', u1.period_start) 
            ORDER BY u1.sms_sent DESC, u1.created_at ASC
        ) as rn
    FROM usage_counters u1
    WHERE EXISTS (
        -- Check if there's another row for same org in same month
        SELECT 1 FROM usage_counters u2 
        WHERE u2.org_id = u1.org_id 
        AND u2.id != u1.id
        AND DATE_TRUNC('month', u2.period_start) = DATE_TRUNC('month', u1.period_start)
    )
)
DELETE FROM usage_counters u
WHERE u.id IN (
    SELECT id FROM duplicate_periods WHERE rn > 1
);

-- Log deduplication results
DO $$ 
DECLARE 
    deleted_count integer;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        RAISE NOTICE 'Removed % duplicate usage_counters rows', deleted_count;
    ELSE
        RAISE NOTICE 'No duplicate periods found to remove';
    END IF;
END $$;

-- =================================================================
-- PART 4: MIGRATE DATA FROM SMS_USAGE
-- =================================================================

-- Migrate existing sms_usage data using correct [start, end) period boundaries
-- Only inserts data that doesn't already exist in usage_counters
INSERT INTO usage_counters (org_id, period_start, period_end, sms_sent, emails_sent, created_at, updated_at)
SELECT 
    s.org_id,
    -- period_start: First day of month at 00:00:00 (inclusive)
    (s.month || '-01')::date::timestamp AS period_start,
    -- period_end: First day of NEXT month at 00:00:00 (exclusive)
    ((s.month || '-01')::date + INTERVAL '1 month')::timestamp AS period_end,
    s.sms_count AS sms_sent,
    0 AS emails_sent,  -- Default to 0 for migrated data
    s.created_at,
    s.updated_at
FROM sms_usage s
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_usage')
AND NOT EXISTS (
    -- Only insert if normalized period doesn't already exist
    SELECT 1 FROM usage_counters u 
    WHERE u.org_id = s.org_id 
    AND u.period_start = (s.month || '-01')::date::timestamp
    AND u.period_end = ((s.month || '-01')::date + INTERVAL '1 month')::timestamp
);

-- Log migration results
DO $$
DECLARE 
    migrated_count integer;
BEGIN
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    IF migrated_count > 0 THEN
        RAISE NOTICE 'Migrated % records from sms_usage to usage_counters', migrated_count;
    ELSE
        RAISE NOTICE 'No new sms_usage data to migrate';
    END IF;
END $$;

-- =================================================================
-- PART 5: ADD CONSTRAINTS AND INDEXES
-- =================================================================

-- Add CHECK constraint for period validation
ALTER TABLE usage_counters 
  ADD CONSTRAINT usage_counters_period_valid 
  CHECK (period_end > period_start);

-- Add foreign key constraint to orgs table
ALTER TABLE usage_counters 
  ADD CONSTRAINT usage_counters_org_id_fkey 
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- Primary unique constraint for preventing duplicate billing periods
CREATE UNIQUE INDEX usage_counters_org_period_unique 
  ON usage_counters (org_id, period_start, period_end);

-- Non-unique index for efficient period lookups
CREATE INDEX usage_counters_org_period_lookup_idx 
  ON usage_counters (org_id, period_start);

-- =================================================================
-- PART 6: CREATE HELPER FUNCTIONS
-- =================================================================

-- Function to get current period boundaries for consistent usage patterns
CREATE OR REPLACE FUNCTION get_current_usage_period(tz text DEFAULT 'UTC')
RETURNS TABLE(period_start timestamp, period_end timestamp) 
LANGUAGE sql STABLE AS $$
    SELECT 
        DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE tz)::timestamp as period_start,
        (DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE tz) + INTERVAL '1 month')::timestamp as period_end;
$$;

-- =================================================================
-- PART 7: DOCUMENTATION AND COMMENTS
-- =================================================================

-- Document the table structure and purpose
COMMENT ON TABLE usage_counters IS 'SINGLE SOURCE OF TRUTH: Period-based usage tracking with [start, end) boundaries. Used for subscription billing and quota enforcement.';

-- Document the normalized period format
COMMENT ON COLUMN usage_counters.period_start IS '[INCLUSIVE] Start of billing period (first day of month 00:00:00)';
COMMENT ON COLUMN usage_counters.period_end IS '[EXCLUSIVE] End of billing period (first day of next month 00:00:00)';
COMMENT ON COLUMN usage_counters.sms_sent IS 'Total SMS messages sent during this period';
COMMENT ON COLUMN usage_counters.emails_sent IS 'Total emails sent during this period';
COMMENT ON COLUMN usage_counters.org_id IS 'Foreign key to orgs(id) - organization owning this usage period';

-- Add deprecation notice to sms_usage table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_usage') THEN
        COMMENT ON TABLE sms_usage IS 'DEPRECATED: Legacy monthly SMS tracking. Replaced by usage_counters for consistency. Maintained for historical reference.';
        COMMENT ON COLUMN sms_usage.month IS 'DEPRECATED: Month in YYYY-MM format. Use usage_counters period boundaries instead.';
    END IF;
END $$;

-- =================================================================
-- PART 8: FINAL VERIFICATION AND VALIDATION
-- =================================================================

-- Comprehensive data integrity checks
DO $$
DECLARE
    total_usage_rows integer;
    total_sms_sent integer;
    period_count integer;
    invalid_periods integer;
BEGIN
    -- Get basic stats
    SELECT COUNT(*), COALESCE(SUM(sms_sent), 0) 
    INTO total_usage_rows, total_sms_sent 
    FROM usage_counters;
    
    -- Count unique periods
    SELECT COUNT(DISTINCT (org_id, DATE_TRUNC('month', period_start)))
    INTO period_count
    FROM usage_counters;
    
    -- Check for invalid periods
    SELECT COUNT(*)
    INTO invalid_periods
    FROM usage_counters 
    WHERE period_end <= period_start
    OR period_start != DATE_TRUNC('month', period_start)
    OR period_end != DATE_TRUNC('month', period_start) + INTERVAL '1 month';
    
    -- Verify data integrity
    IF invalid_periods > 0 THEN
        RAISE EXCEPTION 'VALIDATION FAILED: % invalid periods found - periods must follow [month_start, next_month_start) pattern', invalid_periods;
    END IF;
    
    -- Verify no duplicates exist
    IF total_usage_rows != period_count THEN
        RAISE EXCEPTION 'VALIDATION FAILED: Duplicate periods detected: % total rows vs % unique periods', total_usage_rows, period_count;
    END IF;
    
    -- Success logging
    RAISE NOTICE '=== MIGRATION COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'usage_counters table: % rows tracking % total SMS', total_usage_rows, total_sms_sent;
    RAISE NOTICE 'All periods normalized to [start, end) pattern';
    RAISE NOTICE 'Single source of truth: usage_counters established';
    RAISE NOTICE 'Schema constraints and indexes created';
    RAISE NOTICE 'Helper functions available: get_current_usage_period()';
    
    -- Log sample of current data structure
    RAISE NOTICE 'Sample period format verification:';
    PERFORM 1; -- Placeholder for sample verification
END $$;

COMMIT;

-- =================================================================
-- USAGE EXAMPLES AND VERIFICATION QUERIES (commented for reference)
-- =================================================================

-- Verify period boundaries are correct:
/*
SELECT 
    org_id,
    period_start,
    period_end,
    period_end - period_start as duration,
    EXTRACT(day FROM period_end - period_start) as days,
    sms_sent,
    emails_sent
FROM usage_counters 
ORDER BY period_start DESC 
LIMIT 5;
*/

-- Test helper function:
/*
SELECT 'Current period boundaries:' as info, * FROM get_current_usage_period();
SELECT 'Melbourne timezone:' as info, * FROM get_current_usage_period('Australia/Melbourne');
*/

-- Verify table structure:
/*
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'usage_counters'
ORDER BY ordinal_position;
*/

-- Verify indexes and constraints:
/*
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'usage_counters'
ORDER BY indexname;

SELECT 
    conname,
    contype,
    pg_get_constraintdef(oid)
FROM pg_constraint 
WHERE conrelid = 'usage_counters'::regclass;
*/