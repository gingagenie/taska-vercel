import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

// Clean up any whitespace issues in the connection string
const databaseUrl = process.env.DATABASE_URL.replace(/:\s+(\d+)/, ':$1').trim()

const client = postgres(databaseUrl)
export const db = drizzle(client, { schema })