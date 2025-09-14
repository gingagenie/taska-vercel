-- Enhanced Support System Tables for Admin Console
-- This migration adds fields needed for comprehensive support staff management

-- Add missing fields to support_invites table
ALTER TABLE support_invites ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'support_agent';
ALTER TABLE support_invites ADD COLUMN IF NOT EXISTS cancelled_at timestamp;
ALTER TABLE support_invites ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES support_users(id);

-- Add check constraint for invite role validation
ALTER TABLE support_invites ADD CONSTRAINT IF NOT EXISTS support_invites_role_valid 
CHECK (role IN ('support_agent', 'support_admin'));

-- Update support_users role constraint to match common conventions
ALTER TABLE support_users DROP CONSTRAINT IF EXISTS support_users_role_valid;
ALTER TABLE support_users ADD CONSTRAINT support_users_role_valid 
CHECK (role IN ('support_agent', 'support_admin', 'support_user'));

-- Add deleted_at and updated_at to support_users for soft deletes
ALTER TABLE support_users ADD COLUMN IF NOT EXISTS deleted_at timestamp;
ALTER TABLE support_users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- Update support_audit_logs to have more detailed tracking fields
ALTER TABLE support_audit_logs ADD COLUMN IF NOT EXISTS support_user_id uuid REFERENCES support_users(id);
ALTER TABLE support_audit_logs ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE support_audit_logs ADD COLUMN IF NOT EXISTS ip_address varchar(45);
ALTER TABLE support_audit_logs ADD COLUMN IF NOT EXISTS user_agent text;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS support_invites_role_idx ON support_invites (role);
CREATE INDEX IF NOT EXISTS support_invites_cancelled_idx ON support_invites (cancelled_at);
CREATE INDEX IF NOT EXISTS support_users_deleted_idx ON support_users (deleted_at);
CREATE INDEX IF NOT EXISTS support_users_updated_idx ON support_users (updated_at);
CREATE INDEX IF NOT EXISTS support_audit_logs_support_user_idx ON support_audit_logs (support_user_id, created_at);
CREATE INDEX IF NOT EXISTS support_audit_logs_ip_idx ON support_audit_logs (ip_address);

-- Update existing records to have default role if null
UPDATE support_invites SET role = 'support_agent' WHERE role IS NULL;

-- Create a trigger to automatically update updated_at on support_users
CREATE OR REPLACE FUNCTION update_support_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_support_users_updated_at ON support_users;
CREATE TRIGGER trigger_support_users_updated_at
    BEFORE UPDATE ON support_users
    FOR EACH ROW
    EXECUTE FUNCTION update_support_users_updated_at();