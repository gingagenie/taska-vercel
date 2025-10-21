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
// Reduced to 2 connections to work within Supabase Session mode strict limits
console.log('🔌 [DB CLIENT] Creating new postgres connection pool (max: 2 connections)')
const client = postgres(databaseUrl, {
  max: 2,                     // Minimal connections for Supabase Session mode
  idle_timeout: 5,            // Close idle connections quickly
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