import { createClient } from '@supabase/supabase-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL
const useHTTP = process.env.USE_SUPABASE_HTTP === 'true'

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

// Create Supabase client for auth/realtime features
export const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Create database connection
let db: any

if (useHTTP) {
  console.log('🌐 [supabase.ts] Using HTTP API mode - redirecting to main client');
  // For HTTP mode, use the main client instead of creating a separate connection
  const { db: mainDb } = require('./client');
  db = mainDb;
} else {
  // Traditional TCP mode
  if (!supabaseDatabaseUrl) {
    throw new Error('SUPABASE_DATABASE_URL not set')
  }
  
  const sql = postgres(supabaseDatabaseUrl)
  db = drizzle(sql)
}

export { db }