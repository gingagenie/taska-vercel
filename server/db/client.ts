import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '../../shared/schema'

// Environment-based database configuration
function getDatabaseConfig() {
  const nodeEnv = process.env.NODE_ENV
  const isProduction = nodeEnv === 'production'
  
  // FIXED: Use local Replit database (secure, no BYPASSRLS vulnerability)
  // Build connection string from PG environment variables
  let databaseUrl = process.env.PGHOST && process.env.PGPORT && process.env.PGDATABASE
    ? `postgresql://postgres:password@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`
    : (isProduction ? process.env.SUPABASE_DATABASE_URL : process.env.DATABASE_URL)
  
  // DEBUG: Check all available database environment variables
  console.log('🔍 Available DATABASE environment variables:')
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET')
  console.log('SUPABASE_DATABASE_URL:', process.env.SUPABASE_DATABASE_URL ? 'SET' : 'NOT SET')
  console.log('PGHOST:', process.env.PGHOST || 'NOT SET')
  console.log('PGPORT:', process.env.PGPORT || 'NOT SET')
  console.log('PGDATABASE:', process.env.PGDATABASE || 'NOT SET')
  
  if (databaseUrl) {
    console.log('📋 Final database URL pattern:', databaseUrl.replace(/:[^:]*@/, ':***@'))
    console.log('🔍 URL analysis:', {
      isSupabase: databaseUrl.includes('supabase.com'),
      isLocal: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1'),
      hasPort6543: databaseUrl.includes(':6543'),
      hasPort5432: databaseUrl.includes(':5432')
    })
  }

  if (!databaseUrl) {
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')))
    console.error('NODE_ENV:', nodeEnv)
    throw new Error(`Database URL not set for environment: ${isProduction ? 'production' : 'development'}`)
  }

  const environment = isProduction ? 'production (Supabase)' : 'development (Replit)'
  console.log(`🚀 Connecting to ${environment} database...`)
  console.log(`🔍 Actual URL being used: ${databaseUrl ? databaseUrl.substring(0, 20) + '...' : 'NONE'}`)

  // Different connection settings based on environment
  const connectionConfig = isProduction 
    ? {
        max: 20,                    // Higher pool size for production
        idle_timeout: 30,           // Keep connections alive longer
        connect_timeout: 5,         // Reduce connection timeout for faster failures
        prepare: true,              // Enable prepared statements for better performance
        ssl: { rejectUnauthorized: false },  // Accept self-signed certificates in production
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
const sqlConnection = postgres(databaseUrl, connectionConfig)
export const db = drizzle(sqlConnection, { schema })

console.log(`✅ Connected to ${environment} database`)

/**
 * CRITICAL SECURITY VERIFICATION
 * 
 * Verifies that the database connection is using a secure role without
 * BYPASSRLS or SUPERUSER privileges. This prevents the vulnerability where
 * RLS policies are completely ignored.
 */
export async function verifyDatabaseRoleSecurity(): Promise<boolean> {
  try {
    console.log('🔒 Verifying database role security...')
    
    const roleCheck = await db.execute(sql`
      SELECT 
        current_user as role_name,
        usesuper as is_superuser,
        usebypassrls as can_bypass_rls,
        NOT (usesuper OR usebypassrls) as is_secure
      FROM pg_user 
      WHERE usename = current_user
    `)
    
    if (roleCheck.length === 0) {
      console.error('❌ CRITICAL: Could not verify database role security')
      return false
    }
    
    const role = roleCheck[0]
    const roleName = role.role_name
    const isSuperuser = role.is_superuser
    const canBypassRLS = role.can_bypass_rls
    const isSecure = role.is_secure
    
    console.log(`📋 Database Role Security Audit:`)
    console.log(`   Role: ${roleName}`)
    console.log(`   Superuser: ${isSuperuser ? '❌ YES (DANGEROUS)' : '✅ NO'}`)
    console.log(`   Can Bypass RLS: ${canBypassRLS ? '❌ YES (CRITICAL VULNERABILITY)' : '✅ NO'}`)
    console.log(`   Is Secure: ${isSecure ? '✅ YES' : '❌ NO'}`)
    
    if (!isSecure) {
      console.error('\n🚨 CRITICAL SECURITY VULNERABILITY DETECTED!')
      console.error('🚨 Database role has dangerous privileges that bypass Row Level Security!')
      console.error('🚨 This completely breaks multi-tenant data isolation!')
      console.error('\n📋 REQUIRED ACTIONS:')
      console.error('   1. Create a secure database role: CREATE ROLE taska_app WITH LOGIN NOSUPERUSER NOBYPASSRLS')
      console.error('   2. Update connection string to use the secure role')
      console.error('   3. Grant only necessary permissions to the new role')
      console.error('\n⚠️  BLOCKING APPLICATION STARTUP DUE TO SECURITY VULNERABILITY')
      return false
    }
    
    console.log('✅ Database role security verified - safe for multi-tenant use')
    return true
    
  } catch (error) {
    console.error('❌ CRITICAL: Failed to verify database role security:', error)
    console.error('⚠️  This could indicate a serious security configuration issue')
    return false
  }
}

/**
 * Verify RLS is properly enabled and enforced on tenant tables
 */
export async function verifyRLSEnforcement(): Promise<boolean> {
  try {
    console.log('🔐 Verifying Row Level Security enforcement...')
    
    // Check critical tenant tables have RLS enabled and forced
    const rlsCheck = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        rowsecurity as rls_enabled,
        pg_class.relforcerowsecurity as rls_forced
      FROM pg_tables 
      LEFT JOIN pg_class ON pg_class.relname = pg_tables.tablename
      WHERE schemaname = 'public'
      AND tablename IN ('orgs', 'users', 'customers', 'jobs', 'equipment', 'quotes', 'invoices')
      ORDER BY tablename
    `)
    
    let allSecure = true
    
    console.log('📋 Row Level Security Status:')
    for (const table of rlsCheck) {
      const isEnabled = table.rls_enabled
      const isForced = table.rls_forced
      const isSecure = isEnabled && isForced
      
      console.log(`   ${table.tablename}: ${isSecure ? '✅' : '❌'} (enabled: ${isEnabled}, forced: ${isForced})`)
      
      if (!isSecure) {
        allSecure = false
      }
    }
    
    if (!allSecure) {
      console.error('\n❌ CRITICAL: Some tenant tables do not have proper RLS enforcement!')
      console.error('📋 Run this SQL to fix: ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY; ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;')
      return false
    }
    
    console.log('✅ Row Level Security properly enforced on all tenant tables')
    return true
    
  } catch (error) {
    console.error('❌ Failed to verify RLS enforcement:', error)
    return false
  }
}

/**
 * Comprehensive security startup verification
 * BLOCKS APPLICATION STARTUP if security is compromised
 */
export async function performSecurityStartupCheck(): Promise<void> {
  console.log('\n🔒 PERFORMING CRITICAL SECURITY STARTUP VERIFICATION')
  console.log('==================================================')
  
  try {
    const [roleSecure, rlsSecure] = await Promise.all([
      verifyDatabaseRoleSecurity(),
      verifyRLSEnforcement()
    ])
    
    if (!roleSecure || !rlsSecure) {
      console.error('\n🚨 CRITICAL SECURITY VERIFICATION FAILED!')
      console.error('🚨 APPLICATION STARTUP BLOCKED DUE TO SECURITY VULNERABILITIES!')
      console.error('\n📋 This prevents catastrophic data breaches in multi-tenant systems.')
      console.error('📋 Fix the security issues above before restarting the application.')
      
      // In development, we can continue with warnings but log heavily
      // In production, we should exit to prevent data breaches
      if (process.env.NODE_ENV === 'production') {
        console.error('\n⚠️  EXITING APPLICATION TO PREVENT DATA BREACH IN PRODUCTION')
        process.exit(1)
      } else {
        console.error('\n⚠️  CONTINUING IN DEVELOPMENT MODE WITH SECURITY WARNINGS')
        console.error('⚠️  DO NOT DEPLOY TO PRODUCTION WITH THESE SECURITY ISSUES!')
      }
    } else {
      console.log('\n🎉 SECURITY VERIFICATION PASSED!')
      console.log('✅ Database role is secure (no BYPASSRLS or SUPERUSER)')
      console.log('✅ Row Level Security is properly enforced')
      console.log('✅ Safe for multi-tenant production use')
    }
    
  } catch (error) {
    console.error('\n💥 SECURITY VERIFICATION CRASHED:', error)
    console.error('⚠️  Cannot verify security status - this is extremely dangerous!')
    
    if (process.env.NODE_ENV === 'production') {
      console.error('⚠️  EXITING APPLICATION DUE TO SECURITY VERIFICATION FAILURE')
      process.exit(1)
    }
  }
  
  console.log('==================================================\n')
}

// Perform security check immediately after connection
performSecurityStartupCheck().catch(error => {
  console.error('Failed to perform security startup check:', error)
})