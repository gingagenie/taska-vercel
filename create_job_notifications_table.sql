-- Create the missing job_notifications table for SMS/notification tracking
-- Run this SQL in your Supabase SQL editor

-- Create job_notifications table (likely for SMS/email notifications)
CREATE TABLE IF NOT EXISTS job_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL DEFAULT 'sms', -- 'sms', 'email', etc.
    recipient VARCHAR(255) NOT NULL, -- phone number or email
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Row Level Security
ALTER TABLE job_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policy consistent with other tables
CREATE POLICY "job_notifications_org_isolation" ON job_notifications
  FOR ALL
  USING (org_id = current_org_id());

-- Grant permissions
GRANT ALL ON job_notifications TO authenticated;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_job_notifications_job_id ON job_notifications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_notifications_org_id ON job_notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_job_notifications_status ON job_notifications(status);
CREATE INDEX IF NOT EXISTS idx_job_notifications_type ON job_notifications(notification_type);

-- Verify the table was created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'job_notifications'
ORDER BY ordinal_position;