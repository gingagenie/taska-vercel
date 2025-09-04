import { createClient } from '@supabase/supabase-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

// Create Supabase client for auth/realtime features
export const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Create database connection for Drizzle
if (!supabaseDatabaseUrl) {
  throw new Error('SUPABASE_DATABASE_URL not set')
}

const sql = postgres(supabaseDatabaseUrl)
export const db = drizzle(sql)