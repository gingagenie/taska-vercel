import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

// Use Supabase database connection
const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL

if (!supabaseDatabaseUrl) {
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')))
  throw new Error('SUPABASE_DATABASE_URL not set')
}

console.log('🚀 Connecting to Supabase database...')
const sql = postgres(supabaseDatabaseUrl, {
  max: 20,                    // Increase connection pool size
  idle_timeout: 30,           // Keep connections alive longer
  connect_timeout: 5,         // Reduce connection timeout for faster failures
  prepare: true,              // Enable prepared statements for better performance
  ssl: 'require',             // Require SSL for Supabase
  connection: {
    application_name: 'taska-v2'
  }
})
export const db = drizzle(sql, { schema })