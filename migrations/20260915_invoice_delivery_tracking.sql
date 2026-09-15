ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS email_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS email_status     varchar(30),
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS scanner_hits     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_hit_at     timestamptz;
