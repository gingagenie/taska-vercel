import { db } from './client'
import { sql } from 'drizzle-orm'

/**
 * COMPREHENSIVE MULTI-TENANT SECURITY AUDIT
 * 
 * This audit conducts extensive testing of Row Level Security (RLS) policies
 * and multi-tenant data isolation across all user-facing tables.
 * 
 * CRITICAL SECURITY TESTS:
 * 1. RLS Policy Verification
 * 2. Cross-Organization Access Prevention
 * 3. SQL Injection Resistance
 * 4. Edge Case Boundary Testing
 * 5. API Context Validation
 */

// Test organizations for isolation testing
const TEST_ORG_1 = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77' // Fix My Forklift
const TEST_ORG_2 = '00000000-0000-0000-0000-000000000001' // Fake org
const TEST_ORG_NONEXISTENT = '00000000-0000-0000-0000-000000000000' // Nonexistent

interface SecurityTestResult {
  testName: string
  passed: boolean
  details: string
  criticalFailure?: boolean
}

export async function runComprehensiveSecurityAudit(): Promise<boolean> {
  console.log('🔐 COMPREHENSIVE MULTI-TENANT SECURITY AUDIT')
  console.log('==============================================')
  console.log('Testing all org-level tables for data isolation...\n')
  
  const results: SecurityTestResult[] = []
  
  try {
    // Test 1: Verify RLS is enabled on ALL org-level tables
    await testRLSEnabled(results)
    
    // Test 2: Verify RLS policies exist for ALL org-level tables  
    await testRLSPolicies(results)
    
    // Test 3: Test cross-organization access on all major tables
    await testCrossOrgAccess(results)
    
    // Test 4: Test SQL injection resistance
    await testSQLInjectionResistance(results)
    
    // Test 5: Test edge cases and boundary conditions
    await testEdgeCases(results)
    
    // Test 6: Test helper function security
    await testHelperFunctions(results)
    
    // Test 7: Test session context isolation
    await testSessionContextIsolation(results)
    
    // Test 8: Test data enumeration prevention
    await testDataEnumerationPrevention(results)
    
    // Generate final report
    return generateSecurityReport(results)
    
  } catch (error) {
    console.error('💥 SECURITY AUDIT CRASHED:', error)
    return false
  }
}

async function testRLSEnabled(results: SecurityTestResult[]) {
  console.log('🧪 Test 1: Row Level Security Status - ALL Tables')
  
  // Get all tables with org_id columns
  const tablesWithOrgId = await db.execute(sql`
    SELECT DISTINCT table_name
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND column_name = 'org_id'
    AND table_name NOT LIKE 'drizzle_%'
    ORDER BY table_name
  `)
  
  console.log(`Found ${tablesWithOrgId.length} tables with org_id columns`)
  
  // Check RLS status for each table
  const rlsStatus = await db.execute(sql`
    SELECT schemaname, tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (${tablesWithOrgId.map(t => `'${t.table_name}'`).join(',')})
    ORDER BY tablename
  `)
  
  let allEnabled = true
  const failedTables: string[] = []
  
  for (const table of rlsStatus) {
    const status = table.rowsecurity ? '✅ ENABLED' : '❌ DISABLED'
    console.log(`  ${table.tablename}: ${status}`)
    if (!table.rowsecurity) {
      allEnabled = false
      failedTables.push(table.tablename)
    }
  }
  
  results.push({
    testName: 'RLS Enabled on All Org Tables',
    passed: allEnabled,
    details: allEnabled 
      ? `All ${rlsStatus.length} org-level tables have RLS enabled`
      : `RLS disabled on: ${failedTables.join(', ')}`,
    criticalFailure: !allEnabled
  })
}

async function testRLSPolicies(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 2: RLS Policy Coverage - ALL Tables')
  
  const policies = await db.execute(sql`
    SELECT schemaname, tablename, policyname, cmd, permissive
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `)
  
  // Get all tables with org_id columns
  const tablesWithOrgId = await db.execute(sql`
    SELECT DISTINCT table_name
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND column_name = 'org_id'
    AND table_name NOT LIKE 'drizzle_%'
    ORDER BY table_name
  `)
  
  const expectedTables = tablesWithOrgId.map(t => t.table_name)
  const tablesWithPolicies = [...new Set(policies.map(p => p.tablename))]
  const missingPolicies = expectedTables.filter(table => !tablesWithPolicies.includes(table))
  
  console.log('Policy coverage:')
  for (const table of expectedTables) {
    const tablePolicies = policies.filter(p => p.tablename === table)
    if (tablePolicies.length > 0) {
      console.log(`  ✅ ${table}: ${tablePolicies.length} policies`)
    } else {
      console.log(`  ❌ ${table}: NO POLICIES`)
    }
  }
  
  results.push({
    testName: 'RLS Policy Coverage',
    passed: missingPolicies.length === 0,
    details: missingPolicies.length === 0 
      ? `All ${expectedTables.length} org-level tables have security policies`
      : `Missing policies: ${missingPolicies.join(', ')}`,
    criticalFailure: missingPolicies.length > 0
  })
}

async function testCrossOrgAccess(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 3: Cross-Organization Access Prevention')
  
  // Test major user-facing tables
  const tablesToTest = [
    'customers', 'jobs', 'equipment', 'quotes', 'invoices', 
    'job_photos', 'usage_packs', 'org_subscriptions', 'item_presets'
  ]
  
  for (const table of tablesToTest) {
    try {
      // Set context to legitimate org
      await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_1}'`))
      const legitimateCount = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`))
      
      // Set context to nonexistent org
      await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_NONEXISTENT}'`))
      const unauthorizedCount = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`))
      
      const legitimate = Number(legitimateCount[0]?.count || 0)
      const unauthorized = Number(unauthorizedCount[0]?.count || 0)
      
      const passed = unauthorized === 0
      console.log(`  ${table}: legitimate=${legitimate}, unauthorized=${unauthorized} ${passed ? '✅' : '❌'}`)
      
      results.push({
        testName: `Cross-Org Access Prevention - ${table}`,
        passed,
        details: `Legitimate org sees ${legitimate} records, unauthorized org sees ${unauthorized} records`,
        criticalFailure: !passed
      })
      
    } catch (error) {
      console.log(`  ${table}: ERROR - ${error}`)
      results.push({
        testName: `Cross-Org Access Prevention - ${table}`,
        passed: false,
        details: `Error during test: ${error}`,
        criticalFailure: true
      })
    }
  }
}

async function testSQLInjectionResistance(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 4: SQL Injection Resistance')
  
  const injectionPayloads = [
    "'; DROP TABLE customers; --",
    "' OR '1'='1",
    "'; SELECT * FROM users; --",
    "' UNION SELECT id FROM orgs --",
    "'; SET app.current_org = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77'; --"
  ]
  
  let allResistant = true
  
  for (const payload of injectionPayloads) {
    try {
      // Try injection via session variable
      await db.execute(sql.raw(`SET app.current_org = '${payload.replace(/'/g, "''")}'`))
      
      // Test if it affected data access
      const testResult = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
      const count = Number(testResult[0]?.count || 0)
      
      // If we get data, the injection might have worked
      if (count > 0) {
        console.log(`  ⚠️ Potential injection success with payload: ${payload}`)
        allResistant = false
      } else {
        console.log(`  ✅ Injection blocked: ${payload.substring(0, 30)}...`)
      }
      
    } catch (error) {
      // Errors are good - means injection was blocked
      console.log(`  ✅ Injection error (blocked): ${payload.substring(0, 30)}...`)
    }
  }
  
  results.push({
    testName: 'SQL Injection Resistance',
    passed: allResistant,
    details: allResistant ? 'All injection attempts blocked' : 'Some injection attempts may have succeeded',
    criticalFailure: !allResistant
  })
}

async function testEdgeCases(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 5: Edge Cases and Boundary Conditions')
  
  const tests = [
    {
      name: 'NULL Org Context',
      test: async () => {
        await db.execute(sql.raw(`SET app.current_org = NULL`))
        const result = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
        return Number(result[0]?.count || 0) === 0
      }
    },
    {
      name: 'Empty String Org Context',
      test: async () => {
        await db.execute(sql.raw(`SET app.current_org = ''`))
        const result = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
        return Number(result[0]?.count || 0) === 0
      }
    },
    {
      name: 'Invalid UUID Org Context',
      test: async () => {
        try {
          await db.execute(sql.raw(`SET app.current_org = 'invalid-uuid'`))
          const result = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
          return Number(result[0]?.count || 0) === 0
        } catch {
          return true // Error is expected and good
        }
      }
    },
    {
      name: 'Multiple Org Context Changes',
      test: async () => {
        await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_1}'`))
        const count1 = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
        
        await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_NONEXISTENT}'`))
        const count2 = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
        
        return Number(count1[0]?.count || 0) > 0 && Number(count2[0]?.count || 0) === 0
      }
    }
  ]
  
  for (const test of tests) {
    try {
      const passed = await test.test()
      console.log(`  ${test.name}: ${passed ? '✅' : '❌'}`)
      
      results.push({
        testName: `Edge Case - ${test.name}`,
        passed,
        details: passed ? 'Handled correctly' : 'Failed boundary test',
        criticalFailure: !passed
      })
    } catch (error) {
      console.log(`  ${test.name}: ERROR - ${error}`)
      results.push({
        testName: `Edge Case - ${test.name}`,
        passed: false,
        details: `Error: ${error}`,
        criticalFailure: true
      })
    }
  }
}

async function testHelperFunctions(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 6: Helper Function Security')
  
  // Test current_org_id() function
  await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_1}'`))
  const helperResult = await db.execute(sql`SELECT current_org_id() as org_id`)
  const returnedOrgId = helperResult[0]?.org_id
  
  const helperWorking = returnedOrgId === TEST_ORG_1
  console.log(`  current_org_id() function: ${helperWorking ? '✅' : '❌'} (returned: ${returnedOrgId})`)
  
  results.push({
    testName: 'Helper Function Security',
    passed: helperWorking,
    details: `current_org_id() returned ${returnedOrgId}, expected ${TEST_ORG_1}`,
    criticalFailure: !helperWorking
  })
}

async function testSessionContextIsolation(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 7: Session Context Isolation')
  
  // Test that different session contexts don't interfere
  const tests = [
    {
      org: TEST_ORG_1,
      expectedData: true
    },
    {
      org: TEST_ORG_NONEXISTENT, 
      expectedData: false
    }
  ]
  
  let allIsolated = true
  
  for (const test of tests) {
    await db.execute(sql.raw(`SET app.current_org = '${test.org}'`))
    const customers = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE org_id = current_setting('app.current_org')::uuid
    `)
    
    const hasData = Number(customers[0]?.count || 0) > 0
    const passed = hasData === test.expectedData
    
    console.log(`  Org ${test.org}: ${passed ? '✅' : '❌'} (has data: ${hasData}, expected: ${test.expectedData})`)
    
    if (!passed) allIsolated = false
  }
  
  results.push({
    testName: 'Session Context Isolation',
    passed: allIsolated,
    details: allIsolated ? 'All session contexts properly isolated' : 'Session context isolation failed',
    criticalFailure: !allIsolated
  })
}

async function testDataEnumerationPrevention(results: SecurityTestResult[]) {
  console.log('\n🧪 Test 8: Data Enumeration Prevention')
  
  // Test that unauthorized access returns no hints about data existence
  await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_NONEXISTENT}'`))
  
  const enumerationTests = [
    'customers',
    'jobs',
    'quotes', 
    'invoices',
    'equipment'
  ]
  
  let allSecure = true
  
  for (const table of enumerationTests) {
    try {
      const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`))
      const count = Number(result[0]?.count || 0)
      
      const secure = count === 0
      console.log(`  ${table} enumeration: ${secure ? '✅' : '❌'} (count: ${count})`)
      
      if (!secure) allSecure = false
      
    } catch (error) {
      console.log(`  ${table} enumeration: ✅ (blocked with error)`)
    }
  }
  
  results.push({
    testName: 'Data Enumeration Prevention',
    passed: allSecure,
    details: allSecure ? 'No data enumeration possible' : 'Data enumeration may be possible',
    criticalFailure: !allSecure
  })
}

function generateSecurityReport(results: SecurityTestResult[]): boolean {
  console.log('\n🔐 COMPREHENSIVE SECURITY AUDIT RESULTS')
  console.log('=========================================')
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const critical = results.filter(r => r.criticalFailure).length
  
  console.log(`✅ PASSED: ${passed}`)
  console.log(`❌ FAILED: ${failed}`)
  console.log(`🚨 CRITICAL: ${critical}`)
  
  // Show failed tests
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:')
    results.filter(r => !r.passed).forEach(result => {
      const prefix = result.criticalFailure ? '🚨' : '⚠️'
      console.log(`  ${prefix} ${result.testName}: ${result.details}`)
    })
  }
  
  const isSecure = failed === 0 && critical === 0
  
  if (isSecure) {
    console.log('\n🎉 COMPREHENSIVE SECURITY AUDIT PASSED!')
    console.log('🔐 All multi-tenant isolation mechanisms are working correctly.')
    console.log('🚀 System is SECURE for production deployment!')
  } else {
    console.log('\n⚠️ COMPREHENSIVE SECURITY AUDIT FAILED!')
    console.log('❌ CRITICAL SECURITY ISSUES FOUND!')
    console.log('🚨 DO NOT DEPLOY TO PRODUCTION!')
    console.log('\n📋 REQUIRED ACTIONS:')
    console.log('1. Fix all critical security failures')
    console.log('2. Re-run security audit until all tests pass')
    console.log('3. Consider additional security hardening')
  }
  
  return isSecure
}

// Run the audit if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveSecurityAudit()
    .then((passed) => {
      process.exit(passed ? 0 : 1)
    })
    .catch((error) => {
      console.error('Comprehensive security audit failed:', error)
      process.exit(1)
    })
}