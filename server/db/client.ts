import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

// Simple database connection using DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

console.log('🔗 Connecting to database...')

const client = postgres(process.env.DATABASE_URL)
export const db = drizzle(client, { schema })

console.log('✅ Connected to database successfully')