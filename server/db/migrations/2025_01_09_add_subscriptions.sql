-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price_monthly INTEGER NOT NULL,
  stripe_price_id VARCHAR(255),
  features JSONB DEFAULT '[]'::JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create organization subscriptions table
CREATE TABLE IF NOT EXISTS org_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'trial',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  trial_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id)
);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, price_monthly, features) VALUES
  ('free', 'Free Trial', 0, '["Basic job management", "Up to 5 jobs per month", "Single user"]'::JSONB),
  ('solo', 'Taska Solo', 2900, '["Unlimited jobs", "Single user", "Basic features", "SMS notifications"]'::JSONB),
  ('pro', 'Taska Pro', 4900, '["Unlimited jobs", "Up to 5 users", "Advanced features", "Integrations", "Priority support"]'::JSONB),
  ('enterprise', 'Taska Enterprise', 9900, '["Unlimited everything", "Unlimited users", "All features", "Custom integrations", "Dedicated support"]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- Give existing orgs a free trial period (30 days from now)
INSERT INTO org_subscriptions (org_id, plan_id, status, trial_end)
SELECT id, 'free', 'trial', NOW() + INTERVAL '30 days'
FROM orgs
WHERE id NOT IN (SELECT org_id FROM org_subscriptions)
ON CONFLICT (org_id) DO NOTHING;