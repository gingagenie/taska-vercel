import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

// Create Supabase client for auth/realtime features
export const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Re-export the shared database client to avoid creating multiple connection pools
// SUPABASE_DATABASE_URL should point to the same database as DATABASE_URL
export { db } from './db/client.js'