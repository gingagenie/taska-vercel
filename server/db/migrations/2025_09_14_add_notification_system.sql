-- Migration: Add notification system tables
-- Date: 2025-09-14
-- Description: Creates notification preferences and history tables for the support ticket notification system

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  urgent_sms_only BOOLEAN DEFAULT true,
  business_hours_only BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on user_id for notification preferences
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_unique ON notification_preferences(user_id);

-- Create notification history table for audit trail
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('email', 'sms')),
  template VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  reservation_id VARCHAR(255),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),
  subject VARCHAR(500),
  message_preview TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for notification history
CREATE INDEX IF NOT EXISTS notification_history_ticket_idx ON notification_history(ticket_id);
CREATE INDEX IF NOT EXISTS notification_history_user_idx ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS notification_history_org_idx ON notification_history(org_id);
CREATE INDEX IF NOT EXISTS notification_history_status_type_idx ON notification_history(status, type);

-- Insert default notification preferences for existing users
INSERT INTO notification_preferences (user_id, email_notifications, sms_notifications, urgent_sms_only, business_hours_only)
SELECT id, true, false, true, true
FROM users
WHERE id NOT IN (SELECT user_id FROM notification_preferences);

COMMIT;