-- Migration: Fix customers_org_id_fkey constraint
-- Date: 2025-08-24
-- Purpose: Ensure customers.org_id properly references orgs(id) for production deployment

BEGIN;

-- 1. Normalize org_id values - ensure they are valid UUIDs
UPDATE customers
SET org_id = NULL
WHERE org_id IS NOT NULL
  AND (org_id::text !~ '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$');

-- Ensure org_id column is proper UUID type
ALTER TABLE customers
  ALTER COLUMN org_id TYPE uuid USING NULLIF(org_id::text, '')::uuid;

-- 2. Insert placeholder orgs for any missing org_ids in customers
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT c.org_id, 'Imported Org', NOW()
FROM customers c
LEFT JOIN orgs o ON o.id = c.org_id
WHERE c.org_id IS NOT NULL AND o.id IS NULL;

-- Insert placeholder orgs for any missing org_ids in users
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT u.org_id, 'Imported Org', NOW()
FROM users u
LEFT JOIN orgs o ON o.id = u.org_id
WHERE u.org_id IS NOT NULL AND o.id IS NULL;

-- 3. Reset FK constraint to point to orgs table
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_org_id_fkey;

-- Add constraint with NOT VALID for zero-downtime deployment
ALTER TABLE customers
  ADD CONSTRAINT customers_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES orgs(id)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;

-- 4. Clean any remaining invalid references
UPDATE customers c
SET org_id = NULL
WHERE c.org_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = c.org_id);

-- 5. Validate the FK constraint
ALTER TABLE customers VALIDATE CONSTRAINT customers_org_id_fkey;

COMMIT;