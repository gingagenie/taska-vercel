-- PRODUCTION EMERGENCY FIX
-- Run this SQL directly in production database console BEFORE deployment
-- This creates missing orgs and ensures FK constraint will work

-- Step 1: Find all missing orgs and create them
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT c.org_id, 
  'Production Org - ' || LEFT(c.org_id::text, 8), 
  NOW()
FROM customers c 
WHERE c.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Also check users table
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT u.org_id, 
  'Production Org - ' || LEFT(u.org_id::text, 8), 
  NOW()
FROM users u 
WHERE u.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = u.org_id)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Verify no violations remain (should return 0)
SELECT COUNT(*) as customers_with_invalid_org
FROM customers c 
WHERE c.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id);

-- Step 4: Test FK constraint creation
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_org_id_fkey;
ALTER TABLE customers
  ADD CONSTRAINT customers_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES orgs(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- If this completes without error, deployment will succeed