-- One-time tokens for portal impersonation (consumed on use)
CREATE TABLE IF NOT EXISTS admin_impersonation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  org_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Audit log of every impersonation session
CREATE TABLE IF NOT EXISTS admin_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  customer_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- Admin device tokens for push notifications
CREATE TABLE IF NOT EXISTS admin_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  device_token text NOT NULL UNIQUE,
  platform varchar(20) NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now()
);
