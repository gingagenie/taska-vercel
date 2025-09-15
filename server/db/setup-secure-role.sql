-- CRITICAL SECURITY FIX: Set up least-privileged database role
-- This fixes the BYPASSRLS vulnerability that was completely disabling RLS

-- Step 1: Create application role with minimal privileges (no BYPASSRLS, no SUPERUSER)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taska_app') THEN
        CREATE ROLE taska_app WITH
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOBYPASSRLS  -- CRITICAL: This role cannot bypass RLS
            NOREPLICATION
            CONNECTION LIMIT 50;
        
        RAISE NOTICE 'Created secure application role: taska_app';
    ELSE
        -- Ensure existing role has correct privileges
        ALTER ROLE taska_app WITH
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOBYPASSRLS  -- CRITICAL: Remove BYPASSRLS if it exists
            NOREPLICATION;
        
        RAISE NOTICE 'Updated existing role taska_app to remove dangerous privileges';
    END IF;
END $$;

-- Step 2: Grant necessary schema and table permissions
GRANT USAGE ON SCHEMA public TO taska_app;
GRANT CONNECT ON DATABASE postgres TO taska_app;

-- Grant table permissions for all existing tables
DO $$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO taska_app', table_name);
    END LOOP;
END $$;

-- Grant sequence permissions for auto-incrementing columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO taska_app;

-- Step 3: Ensure permissions on future tables (for new tables created via migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO taska_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO taska_app;

-- Step 4: Grant session-related permissions for sessions table
GRANT ALL ON TABLE session TO taska_app;
GRANT ALL ON TABLE support_session TO taska_app;

-- Step 5: Force RLS on all tenant tables for defense-in-depth
-- This ensures RLS cannot be disabled even by accident
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE item_presets FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE job_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_packs FORCE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE sms_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_pack_reservations FORCE ROW LEVEL SECURITY;

-- Tables that don't need RLS (support staff access or non-tenant data)
-- support_tickets, ticket_messages, ticket_assignments already have specific policies
-- support_users, notifications are global or have different access patterns

-- Create a verification function to check role security
CREATE OR REPLACE FUNCTION verify_role_security() 
RETURNS TABLE (
    role_name text,
    is_superuser boolean,
    can_bypass_rls boolean,
    is_secure boolean
) 
LANGUAGE SQL
AS $$
    SELECT 
        rolname::text,
        rolsuper,
        rolbypassrls,
        NOT (rolsuper OR rolbypassrls) as is_secure
    FROM pg_roles 
    WHERE rolname = current_user;
$$;

-- Display security status
SELECT 
    'SECURITY AUDIT' as status,
    verify_role_security.*
FROM verify_role_security();

RAISE NOTICE 'SECURITY FIX COMPLETE: Database role configured with least-privileged access';
RAISE NOTICE 'FORCE RLS applied to all tenant tables';
RAISE NOTICE 'Connection strings should now use: user=taska_app password=<secure_password>';