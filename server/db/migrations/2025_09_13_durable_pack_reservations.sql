-- CRITICAL: Add durable pack reservations to fix billing safety issue
-- Replaces vulnerable in-memory reservation system that causes lost credits

CREATE TABLE IF NOT EXISTS usage_pack_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    pack_id UUID NOT NULL REFERENCES usage_packs(id) ON DELETE CASCADE,
    pack_type VARCHAR(10) NOT NULL CHECK (pack_type IN ('sms', 'email')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'finalized', 'released')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Critical indexes for atomic operations and efficient cleanup
CREATE INDEX IF NOT EXISTS reservations_org_pack_type_idx ON usage_pack_reservations(org_id, pack_type, status);
CREATE INDEX IF NOT EXISTS reservations_pack_status_idx ON usage_pack_reservations(pack_id, status);
CREATE INDEX IF NOT EXISTS reservations_status_expiry_idx ON usage_pack_reservations(status, expires_at);

-- Add comment for production safety
COMMENT ON TABLE usage_pack_reservations IS 'Durable pack reservations prevent billing safety issues from process crashes and multi-instance deployments';