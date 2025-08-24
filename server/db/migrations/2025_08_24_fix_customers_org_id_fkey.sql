-- Migration: Fix customers_org_id_fkey constraint
-- Date: 2025-08-24
-- Purpose: Ensure customers.org_id properly references orgs(id) for production deployment

BEGIN;

-- 0. Ensure orgs table exists (create if missing)
CREATE TABLE IF NOT EXISTS orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT NOW()
);

-- 1. First migrate any orgs from organisations table to orgs table if they don't exist
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT o.id, o.name, COALESCE(o.created_at, NOW())
FROM organisations o
LEFT JOIN orgs og ON og.id = o.id
WHERE og.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. For any customers with missing org_ids, try to find them in organisations table first
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT c.org_id, 
  COALESCE(
    (SELECT name FROM organisations WHERE id = c.org_id),
    'Imported Org - ' || c.org_id::text
  ), 
  NOW()
FROM customers c
LEFT JOIN orgs o ON o.id = c.org_id
WHERE c.org_id IS NOT NULL AND o.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. For any users with missing org_ids, try to find them in organisations table first
INSERT INTO orgs (id, name, created_at)
SELECT DISTINCT u.org_id,
  COALESCE(
    (SELECT name FROM organisations WHERE id = u.org_id),
    'Imported Org - ' || u.org_id::text
  ),
  NOW()
FROM users u
LEFT JOIN orgs o ON o.id = u.org_id
WHERE u.org_id IS NOT NULL AND o.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4. Normalize org_id values - ensure they are valid UUIDs
UPDATE customers
SET org_id = NULL
WHERE org_id IS NOT NULL
  AND (org_id::text !~ '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$');

-- 5. Ensure org_id column is proper UUID type (handle both varchar and uuid)
DO $$
BEGIN
  -- Check if column is already uuid type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' 
    AND column_name = 'org_id' 
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE customers
      ALTER COLUMN org_id TYPE uuid USING NULLIF(org_id::text, '')::uuid;
  END IF;
END $$;

-- 6. Drop existing FK constraint if it exists
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_org_id_fkey;

-- 7. Final cleanup - set org_id to NULL for any remaining invalid references
UPDATE customers c
SET org_id = NULL
WHERE c.org_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = c.org_id);

-- 8. Add constraint with NOT VALID for zero-downtime deployment
ALTER TABLE customers
  ADD CONSTRAINT customers_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES orgs(id)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;

-- 9. Validate the FK constraint (this ensures all existing data complies)
ALTER TABLE customers VALIDATE CONSTRAINT customers_org_id_fkey;

COMMIT;