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
const sql = postgres(supabaseDatabaseUrl)
export const db = drizzle(sql, { schema })