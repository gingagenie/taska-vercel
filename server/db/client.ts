import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

// Clean up any whitespace issues in the connection string
const databaseUrl = process.env.DATABASE_URL.replace(/:\s+(\d+)/, ':$1').trim()

// Configure connection pooling optimized for Supabase pooler (PgBouncer)
// Reduced to 4 connections to work within Supabase connection limits
console.log('🔌 [DB CLIENT] Creating new postgres connection pool (max: 4 connections)')
const client = postgres(databaseUrl, {
  max: 4,                     // Reduced for Supabase compatibility
  idle_timeout: 10,           // Close idle connections after 10 seconds
  connect_timeout: 30,        // Allow 30s for connection during cold starts
  max_lifetime: 600,          // Recycle connections after 10 minutes
  prepare: false,             // Required for PgBouncer compatibility
  onnotice: () => {}, // Suppress NOTICE logs
  debug: false
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