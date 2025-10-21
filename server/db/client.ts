import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

// Clean up any whitespace issues in the connection string
const databaseUrl = process.env.DATABASE_URL.replace(/:\s+(\d+)/, ':$1').trim()

// Reduced to 3 connections to work within Supabase Session mode strict limits
// Session mode has very low connection limits even on paid plans
console.log('🔌 [DB CLIENT] Creating postgres connection pool (max: 3 connections)')
const client = postgres(databaseUrl, {
  max: 3,                     // Minimal for Supabase Session mode
  prepare: false,             // Required for PgBouncer compatibility  
  onnotice: () => {}, // Suppress NOTICE logs
})

export const db = drizzle(client, { schema })
export { client as postgresClient }

// Graceful shutdown handler
const cleanup = async () => {
  console.log('[DB] Closing database connections...')
  await client.end({ timeout: 5 })
  console.log('[DB] Database connections closed')
}

process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

console.log('✅ Database connected successfully (shared connection pool)')