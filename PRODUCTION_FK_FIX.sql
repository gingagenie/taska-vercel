-- PRODUCTION EMERGENCY FIX FOR FK CONSTRAINT ERROR
-- Run this SQL directly in your production database BEFORE deployment

-- OPTION 1: DELETE problematic customers (since you don't have real customers yet)
DELETE FROM customers c
WHERE c.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id);

-- OPTION 2: DELETE problematic users (if any exist from testing)
DELETE FROM users u
WHERE u.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = u.org_id);

-- VERIFICATION: Check that all references are valid
SELECT 
    'customers_with_invalid_orgs' as table_name,
    COUNT(*) as count
FROM customers c
WHERE c.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = c.org_id)
UNION ALL
SELECT 
    'users_with_invalid_orgs' as table_name,
    COUNT(*) as count
FROM users u
WHERE u.org_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = u.org_id);

-- Both counts should be 0 after running this
-- Then the FK constraint will deploy successfully