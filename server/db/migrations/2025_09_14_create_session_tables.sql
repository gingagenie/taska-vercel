-- Create session tables for connect-pg-simple session storage
-- This fixes critical production issue where support authentication fails due to missing tables

-- Regular user sessions table
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR(255) NOT NULL,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- Index for efficient cleanup of expired sessions
CREATE INDEX IF NOT EXISTS "session_expire_idx" ON "session" ("expire");

-- Support staff sessions table (completely isolated from regular users)
CREATE TABLE IF NOT EXISTS "support_session" (
  "sid" VARCHAR(255) NOT NULL,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT "support_session_pkey" PRIMARY KEY ("sid")
);

-- Index for efficient cleanup of expired support sessions
CREATE INDEX IF NOT EXISTS "support_session_expire_idx" ON "support_session" ("expire");

-- Ensure existing support tables have proper unique constraints
-- These should already exist but let's make sure they are enforced

-- Ensure support_users.email is unique (should already exist from schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'support_users' 
    AND indexname = 'support_users_email_unique'
  ) THEN
    CREATE UNIQUE INDEX "support_users_email_unique" ON "support_users" ("email");
  END IF;
END $$;

-- Ensure support_invites.token is unique (should already exist from schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'support_invites' 
    AND indexname = 'support_invites_token_unique'
  ) THEN
    CREATE UNIQUE INDEX "support_invites_token_unique" ON "support_invites" ("token");
  END IF;
END $$;

-- Grant appropriate permissions (if needed)
-- Regular session table doesn't need special permissions as it's used by app user
-- Support session table should be accessible by same app user

COMMENT ON TABLE "session" IS 'Session storage for regular user authentication (connect-pg-simple)';
COMMENT ON TABLE "support_session" IS 'Session storage for support staff authentication (isolated from regular users)';