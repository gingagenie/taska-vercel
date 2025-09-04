-- Supabase Row Level Security (RLS) Policies for Multi-Tenant Taska App
-- This script sets up tenant isolation using RLS

-- Enable RLS on all tenant-scoped tables
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's tenant_id from JWT
CREATE OR REPLACE FUNCTION auth.get_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tenant_id uuid;
BEGIN
  -- Extract tenant_id from JWT app_metadata
  SELECT coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->'app_metadata'->>'tenant_id'), 
    null
  )::uuid INTO tenant_id;
  RETURN tenant_id;
END;
$$;

-- Organizations: Users can only see their own org
CREATE POLICY "tenant_isolation_orgs" ON orgs
FOR ALL 
TO authenticated
USING (id = auth.get_tenant_id());

-- Users: Can only see users from their organization
CREATE POLICY "tenant_isolation_users" ON users
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Memberships: Can only see memberships for their org
CREATE POLICY "tenant_isolation_memberships" ON memberships
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Teams: Can only see teams from their organization
CREATE POLICY "tenant_isolation_teams" ON teams
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Team members: Can only see team members from their org's teams
CREATE POLICY "tenant_isolation_team_members" ON team_members
FOR ALL 
TO authenticated
USING (
  team_id IN (
    SELECT id FROM teams WHERE org_id = auth.get_tenant_id()
  )
);

-- Customers: Can only see customers from their organization
CREATE POLICY "tenant_isolation_customers" ON customers
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Equipment: Can only see equipment from their organization
CREATE POLICY "tenant_isolation_equipment" ON equipment
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Jobs: Can only see jobs from their organization
CREATE POLICY "tenant_isolation_jobs" ON jobs
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Job assignments: Can only see job assignments for jobs in their org
CREATE POLICY "tenant_isolation_job_assignments" ON job_assignments
FOR ALL 
TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE org_id = auth.get_tenant_id()
  )
);

-- Job equipment: Can only see job equipment for jobs in their org
CREATE POLICY "tenant_isolation_job_equipment" ON job_equipment
FOR ALL 
TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE org_id = auth.get_tenant_id()
  )
);

-- Quotes: Can only see quotes from their organization
CREATE POLICY "tenant_isolation_quotes" ON quotes
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Invoices: Can only see invoices from their organization
CREATE POLICY "tenant_isolation_invoices" ON invoices
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Item presets: Can only see item presets from their organization
CREATE POLICY "tenant_isolation_item_presets" ON item_presets
FOR ALL 
TO authenticated
USING (org_id = auth.get_tenant_id());

-- Line items: Can only see line items for quotes/invoices in their org
CREATE POLICY "tenant_isolation_line_items" ON line_items
FOR ALL 
TO authenticated
USING (
  (quote_id IS NOT NULL AND quote_id IN (SELECT id FROM quotes WHERE org_id = auth.get_tenant_id()))
  OR
  (invoice_id IS NOT NULL AND invoice_id IN (SELECT id FROM invoices WHERE org_id = auth.get_tenant_id()))
);