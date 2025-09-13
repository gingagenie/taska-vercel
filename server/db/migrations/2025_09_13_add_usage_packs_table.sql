-- MIGRATION: Add usage_packs table for SMS and email add-on purchases
-- Date: 2025-09-13
-- Purpose: Create usage_packs table with proper constraints, indexes, and RLS policies
-- 
-- FEATURES:
-- - Track purchased SMS/email packs per organization
-- - Automatic expiry handling (6 months from purchase)
-- - Stripe payment integration support
-- - Usage tracking with consumed quantities
-- - Proper RLS policies for multi-tenant security
--
-- SAFETY: Fully idempotent, atomic transaction, works on clean and existing databases

BEGIN;

-- =================================================================
-- PART 1: TABLE CREATION
-- =================================================================

-- Create usage_packs table if it doesn't exist
CREATE TABLE IF NOT EXISTS usage_packs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    pack_type varchar(10) NOT NULL,
    quantity integer NOT NULL,
    used_quantity integer NOT NULL DEFAULT 0,
    purchased_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    stripe_payment_id text,
    status varchar(20) NOT NULL DEFAULT 'active',
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- =================================================================
-- PART 2: CONSTRAINTS AND VALIDATION
-- =================================================================

-- Drop existing constraints to ensure clean state (idempotent)
ALTER TABLE usage_packs DROP CONSTRAINT IF EXISTS usage_packs_pack_type_valid;
ALTER TABLE usage_packs DROP CONSTRAINT IF EXISTS usage_packs_status_valid;
ALTER TABLE usage_packs DROP CONSTRAINT IF EXISTS usage_packs_quantity_valid;
ALTER TABLE usage_packs DROP CONSTRAINT IF EXISTS usage_packs_org_id_fkey;
DROP INDEX IF EXISTS usage_packs_org_status_idx;
DROP INDEX IF EXISTS usage_packs_status_expiry_idx;
DROP INDEX IF EXISTS usage_packs_org_lookup_idx;

-- Add CHECK constraints for data validation
ALTER TABLE usage_packs 
  ADD CONSTRAINT usage_packs_pack_type_valid 
  CHECK (pack_type IN ('sms', 'email'));

ALTER TABLE usage_packs 
  ADD CONSTRAINT usage_packs_status_valid 
  CHECK (status IN ('active', 'expired', 'used_up'));

ALTER TABLE usage_packs 
  ADD CONSTRAINT usage_packs_quantity_valid 
  CHECK (quantity > 0 AND used_quantity >= 0 AND used_quantity <= quantity);

-- Add foreign key constraint to orgs table with cascade delete
ALTER TABLE usage_packs 
  ADD CONSTRAINT usage_packs_org_id_fkey 
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- =================================================================
-- PART 3: INDEXES FOR PERFORMANCE
-- =================================================================

-- Primary index for efficient org lookups by status
CREATE INDEX usage_packs_org_status_idx 
  ON usage_packs (org_id, status);

-- Index for efficient expiry checks and cleanup
CREATE INDEX usage_packs_status_expiry_idx 
  ON usage_packs (status, expires_at);

-- General lookup index for organization queries
CREATE INDEX usage_packs_org_lookup_idx 
  ON usage_packs (org_id, pack_type, status);

-- =================================================================
-- PART 4: ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================

-- Enable RLS on the table
ALTER TABLE usage_packs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state (idempotent)
DROP POLICY IF EXISTS usage_packs_tenant_isolation ON usage_packs;
DROP POLICY IF EXISTS usage_packs_insert_own_org ON usage_packs;
DROP POLICY IF EXISTS usage_packs_update_own_org ON usage_packs;
DROP POLICY IF EXISTS usage_packs_delete_own_org ON usage_packs;

-- Create comprehensive RLS policies for multi-tenant security

-- SELECT policy: Users can only see packs for their organization
CREATE POLICY usage_packs_tenant_isolation ON usage_packs
  FOR SELECT
  USING (
    org_id IN (
      SELECT u.org_id FROM users u WHERE u.email = current_user
      UNION
      SELECT m.org_id FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      WHERE u.email = current_user
    )
  );

-- INSERT policy: Users can only create packs for their organization
CREATE POLICY usage_packs_insert_own_org ON usage_packs
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT u.org_id FROM users u WHERE u.email = current_user
      UNION
      SELECT m.org_id FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      WHERE u.email = current_user
    )
  );

-- UPDATE policy: Users can only update packs for their organization
CREATE POLICY usage_packs_update_own_org ON usage_packs
  FOR UPDATE
  USING (
    org_id IN (
      SELECT u.org_id FROM users u WHERE u.email = current_user
      UNION
      SELECT m.org_id FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      WHERE u.email = current_user
    )
  );

-- DELETE policy: Users can only delete packs for their organization
CREATE POLICY usage_packs_delete_own_org ON usage_packs
  FOR DELETE
  USING (
    org_id IN (
      SELECT u.org_id FROM users u WHERE u.email = current_user
      UNION
      SELECT m.org_id FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      WHERE u.email = current_user
    )
  );

-- =================================================================
-- PART 5: HELPER FUNCTIONS
-- =================================================================

-- Function to automatically expire packs that have passed their expiry date
CREATE OR REPLACE FUNCTION expire_old_usage_packs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE usage_packs 
    SET status = 'expired', updated_at = now()
    WHERE status = 'active' 
    AND expires_at < now();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    RETURN expired_count;
END;
$$;

-- Function to automatically mark packs as used_up when fully consumed
CREATE OR REPLACE FUNCTION mark_used_up_packs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    used_up_count INTEGER;
BEGIN
    UPDATE usage_packs 
    SET status = 'used_up', updated_at = now()
    WHERE status = 'active' 
    AND used_quantity >= quantity;
    
    GET DIAGNOSTICS used_up_count = ROW_COUNT;
    
    RETURN used_up_count;
END;
$$;

-- Function to get available quantity for a pack type for an organization
CREATE OR REPLACE FUNCTION get_available_pack_quantity(org_uuid uuid, pack_type_val varchar)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    available_quantity INTEGER;
BEGIN
    SELECT COALESCE(SUM(quantity - used_quantity), 0)
    INTO available_quantity
    FROM usage_packs
    WHERE org_id = org_uuid
    AND pack_type = pack_type_val
    AND status = 'active'
    AND expires_at > now();
    
    RETURN available_quantity;
END;
$$;

-- =================================================================
-- PART 6: DOCUMENTATION AND COMMENTS
-- =================================================================

-- Document the table structure and purpose
COMMENT ON TABLE usage_packs IS 'Usage add-on packs for SMS and email purchases. Tracks purchased packs, consumption, and expiry with proper multi-tenant security.';

-- Document field purposes
COMMENT ON COLUMN usage_packs.org_id IS 'Foreign key to orgs(id) - organization that purchased this pack';
COMMENT ON COLUMN usage_packs.pack_type IS 'Type of pack: sms or email';
COMMENT ON COLUMN usage_packs.quantity IS 'Total quantity purchased in this pack (e.g., 100 SMS, 200 emails)';
COMMENT ON COLUMN usage_packs.used_quantity IS 'How many have been consumed from this pack';
COMMENT ON COLUMN usage_packs.purchased_at IS 'When the pack was purchased';
COMMENT ON COLUMN usage_packs.expires_at IS 'When the pack expires (typically 6 months from purchase)';
COMMENT ON COLUMN usage_packs.stripe_payment_id IS 'Stripe payment ID for tracking and reconciliation';
COMMENT ON COLUMN usage_packs.status IS 'Pack status: active, expired, or used_up';

-- Document helper functions
COMMENT ON FUNCTION expire_old_usage_packs() IS 'Maintenance function to automatically expire old packs';
COMMENT ON FUNCTION mark_used_up_packs() IS 'Maintenance function to mark fully consumed packs';
COMMENT ON FUNCTION get_available_pack_quantity(uuid, varchar) IS 'Get available quantity for a pack type for an organization';

-- =================================================================
-- PART 7: FINAL VERIFICATION AND VALIDATION
-- =================================================================

-- Comprehensive validation checks
DO $$
DECLARE
    table_exists boolean;
    constraint_count integer;
    index_count integer;
    policy_count integer;
    function_count integer;
BEGIN
    -- Check table creation
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'usage_packs'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        RAISE EXCEPTION 'VALIDATION FAILED: usage_packs table was not created';
    END IF;
    
    -- Check constraints
    SELECT COUNT(*) 
    INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE table_name = 'usage_packs' 
    AND constraint_type IN ('CHECK', 'FOREIGN KEY');
    
    IF constraint_count < 4 THEN
        RAISE EXCEPTION 'VALIDATION FAILED: Missing constraints on usage_packs table';
    END IF;
    
    -- Check indexes
    SELECT COUNT(*) 
    INTO index_count
    FROM pg_indexes 
    WHERE tablename = 'usage_packs';
    
    IF index_count < 3 THEN
        RAISE EXCEPTION 'VALIDATION FAILED: Missing indexes on usage_packs table';
    END IF;
    
    -- Check RLS policies
    SELECT COUNT(*) 
    INTO policy_count
    FROM pg_policies 
    WHERE tablename = 'usage_packs';
    
    IF policy_count < 4 THEN
        RAISE EXCEPTION 'VALIDATION FAILED: Missing RLS policies on usage_packs table';
    END IF;
    
    -- Check helper functions
    SELECT COUNT(*) 
    INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN ('expire_old_usage_packs', 'mark_used_up_packs', 'get_available_pack_quantity');
    
    IF function_count < 3 THEN
        RAISE EXCEPTION 'VALIDATION FAILED: Missing helper functions for usage_packs';
    END IF;
    
    -- Success logging
    RAISE NOTICE '=== USAGE_PACKS MIGRATION COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'Table created with % constraints, % indexes, % RLS policies', constraint_count, index_count, policy_count;
    RAISE NOTICE 'Helper functions created: expire_old_usage_packs(), mark_used_up_packs(), get_available_pack_quantity()';
    RAISE NOTICE 'RLS enabled for multi-tenant security';
    RAISE NOTICE 'Ready for production use';
    
    -- Log pack pricing reference
    RAISE NOTICE 'Pack pricing structure:';
    RAISE NOTICE 'SMS Packs: 100 SMS ($5), 500 SMS ($20), 1000 SMS ($35)';
    RAISE NOTICE 'Email Packs: 200 emails ($3), 500 emails ($7), 1000 emails ($12)';
END $$;

COMMIT;

-- =================================================================
-- USAGE EXAMPLES AND VERIFICATION QUERIES (commented for reference)
-- =================================================================

-- Test pack creation:
/*
INSERT INTO usage_packs (org_id, pack_type, quantity, expires_at, stripe_payment_id)
VALUES (
    (SELECT id FROM orgs LIMIT 1),
    'sms',
    100,
    now() + INTERVAL '6 months',
    'pi_test_123456789'
);
*/

-- Test available quantity function:
/*
SELECT 
    org_id,
    get_available_pack_quantity(org_id, 'sms') as available_sms,
    get_available_pack_quantity(org_id, 'email') as available_email
FROM orgs
LIMIT 5;
*/

-- Test expiry function:
/*
SELECT expire_old_usage_packs() as expired_packs;
SELECT mark_used_up_packs() as used_up_packs;
*/

-- Verify table structure:
/*
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'usage_packs'
ORDER BY ordinal_position;
*/

-- Verify constraints and indexes:
/*
SELECT 
    conname,
    contype,
    pg_get_constraintdef(oid)
FROM pg_constraint 
WHERE conrelid = 'usage_packs'::regclass;

SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'usage_packs'
ORDER BY indexname;
*/

-- Verify RLS policies:
/*
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'usage_packs';
*/