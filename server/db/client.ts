import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

// Clean up any whitespace issues in the connection string
const databaseUrl = process.env.DATABASE_URL.replace(/:\s+(\d+)/, ':$1').trim()

const client = postgres(databaseUrl, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 30,
  max_lifetime: 60 * 30
})
export const db = drizzle(client, { schema })

console.log('✅ Database connected successfully')