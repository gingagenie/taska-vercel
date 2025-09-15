import { db } from './client'
import { sql } from 'drizzle-orm'

/**
 * CRITICAL SECURITY FIX - RLS Policy Hardening
 * 
 * This script fixes the critical security vulnerability where invalid org contexts
 * resulted in FAIL-UNSAFE behavior (showing all data instead of no data).
 * 
 * SECURITY PRINCIPLE: FAIL-SECURE
 * - Invalid org context = NO ACCESS (not all access)
 * - NULL org context = NO ACCESS
 * - Malformed org context = NO ACCESS
 */
export async function fixRLSSecurityVulnerability() {
  console.log('🔒 FIXING CRITICAL RLS SECURITY VULNERABILITY')
  console.log('=============================================')
  console.log('Implementing FAIL-SECURE policies...\n')
  
  try {
    // Step 1: Update current_org_id() function to be fail-secure
    console.log('🔧 Step 1: Hardening current_org_id() function...')
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
      DECLARE
        org_uuid uuid;
      BEGIN
        -- Get the setting and validate it's a proper UUID
        BEGIN
          org_uuid := current_setting('app.current_org', true)::uuid;
          
          -- Additional validation: ensure it's not NULL and not all zeros
          IF org_uuid IS NULL OR org_uuid = '00000000-0000-0000-0000-000000000000'::uuid THEN
            RETURN NULL;
          END IF;
          
          RETURN org_uuid;
          
        EXCEPTION
          WHEN OTHERS THEN
            -- FAIL-SECURE: Any error (invalid UUID, etc.) returns NULL
            RETURN NULL;
        END;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `)
    console.log('✅ current_org_id() function hardened with fail-secure logic')

    // Step 2: Update all RLS policies to be fail-secure
    console.log('\n🔧 Step 2: Updating RLS policies to fail-secure...')
    
    const tablesToFix = [
      'customers', 'jobs', 'equipment', 'quotes', 'invoices', 'item_presets',
      'invoice_lines', 'quote_lines', 'job_photos', 'usage_packs', 
      'org_subscriptions', 'sms_usage', 'usage_counters', 'usage_pack_reservations'
    ]
    
    for (const table of tablesToFix) {
      // Drop existing policy
      await db.execute(sql.raw(`DROP POLICY IF EXISTS "${table}_org_isolation" ON ${table}`))
      
      // Create fail-secure policy
      await db.execute(sql.raw(`
        CREATE POLICY "${table}_org_isolation" ON ${table}
        FOR ALL
        USING (
          current_org_id() IS NOT NULL 
          AND org_id = current_org_id()
        )
      `))
      
      console.log(`✅ ${table}: Fail-secure policy created`)
    }

    // Step 3: Special handling for user table (can have NULL org_id for support staff)
    console.log('\n🔧 Step 3: Updating user table policy...')
    await db.execute(sql.raw(`DROP POLICY IF EXISTS "user_org_isolation" ON users`))
    await db.execute(sql`
      CREATE POLICY "user_org_isolation" ON users
      FOR ALL
      USING (
        current_org_id() IS NOT NULL 
        AND (
          org_id = current_org_id() OR 
          (role = 'support_staff' AND org_id IS NULL)
        )
      )
    `)
    console.log('✅ users: Fail-secure policy with support staff exception created')

    // Step 4: Test the fix
    console.log('\n🧪 Step 4: Testing the security fix...')
    
    // Test with valid org
    await db.execute(sql.raw(`SET app.current_org = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77'`))
    const validTest = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
    console.log(`  Valid org access: ${validTest[0].count} records (should be > 0)`)
    
    // Test with invalid org (should now return 0)
    await db.execute(sql.raw(`SET app.current_org = '00000000-0000-0000-0000-000000000000'`))
    const invalidTest = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
    console.log(`  Invalid org access: ${invalidTest[0].count} records (should be 0)`)
    
    // Test with malformed context
    try {
      await db.execute(sql.raw(`SET app.current_org = 'malformed'`))
      const malformedTest = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
      console.log(`  Malformed org access: ${malformedTest[0].count} records (should be 0)`)
    } catch (error) {
      console.log(`  Malformed org access: Blocked with error (GOOD)`)
    }

    const fixWorking = validTest[0].count > 0 && invalidTest[0].count === 0
    
    if (fixWorking) {
      console.log('\n🎉 SECURITY FIX SUCCESSFUL!')
      console.log('✅ RLS policies now implement fail-secure behavior')
      console.log('✅ Invalid org contexts result in NO ACCESS (not all access)')
      console.log('✅ System is now secure against org context tampering')
    } else {
      console.log('\n❌ SECURITY FIX FAILED!')
      console.log('⚠️  Manual intervention required')
    }
    
  } catch (error) {
    console.error('❌ Failed to fix RLS security vulnerability:', error)
    throw error
  }
}

// Run the fix if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixRLSSecurityVulnerability()
    .then(() => {
      console.log('RLS security fix completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('RLS security fix failed:', error)
      process.exit(1)
    })
}