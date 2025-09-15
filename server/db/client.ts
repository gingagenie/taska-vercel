import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../shared/schema'

// Environment-based database configuration
function getDatabaseConfig() {
  const nodeEnv = process.env.NODE_ENV
  const isProduction = nodeEnv === 'production'
  
  // Production: Use SUPABASE_DATABASE_URL (business data)
  // Development/Local: Use DATABASE_URL (local Replit database for testing)
  const databaseUrl = isProduction 
    ? process.env.SUPABASE_DATABASE_URL 
    : process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')))
    console.error('NODE_ENV:', nodeEnv)
    throw new Error(`Database URL not set for environment: ${isProduction ? 'production' : 'development'}`)
  }

  const environment = isProduction ? 'production (Supabase)' : 'development (Replit)'
  console.log(`🚀 Connecting to ${environment} database...`)

  // Different connection settings based on environment
  const connectionConfig = isProduction 
    ? {
        max: 20,                    // Higher pool size for production
        idle_timeout: 30,           // Keep connections alive longer
        connect_timeout: 5,         // Reduce connection timeout for faster failures
        prepare: true,              // Enable prepared statements for better performance
        ssl: true,                  // Require SSL for Supabase
        connection: {
          application_name: 'taska-v2-prod'
        }
      }
    : {
        max: 5,                     // Smaller pool for development
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,             // Disable prepared statements for development flexibility
        ssl: false,                 // Don't require SSL for local development
        connection: {
          application_name: 'taska-v2-dev'
        }
      }

  return { databaseUrl, connectionConfig, environment }
}

const { databaseUrl, connectionConfig, environment } = getDatabaseConfig()
const sql = postgres(databaseUrl, connectionConfig)
export const db = drizzle(sql, { schema })

console.log(`✅ Connected to ${environment} database`)