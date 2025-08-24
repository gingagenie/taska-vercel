-- PRODUCTION EMERGENCY FIX FOR FK CONSTRAINT ERROR
-- Run this SQL directly in your production database BEFORE deployment

-- STEP 1: Find and create missing orgs
DO $$
BEGIN
    -- Create missing orgs for customers
    INSERT INTO orgs (id, name, created_at)
    SELECT DISTINCT 
        c.org_id,
        'Production Org - ' || c.org_id::text,
        NOW()
    FROM customers c
    WHERE c.org_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id)
    ON CONFLICT (id) DO NOTHING;

    -- Create missing orgs for users  
    INSERT INTO orgs (id, name, created_at)
    SELECT DISTINCT 
        u.org_id,
        'Production Org - ' || u.org_id::text,
        NOW()
    FROM users u
    WHERE u.org_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = u.org_id)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Missing orgs created successfully';
END $$;

-- STEP 2: Verify no dangling references
SELECT 
    'customers_missing_orgs' as table_name,
    COUNT(*) as missing_count
FROM customers c
WHERE c.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id)
UNION ALL
SELECT 
    'users_missing_orgs' as table_name,
    COUNT(*) as missing_count
FROM users u
WHERE u.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = u.org_id);

-- If both counts are 0, the FK constraint will work
-- If any counts are > 0, run this script again