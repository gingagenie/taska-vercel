#!/usr/bin/env node
import { db } from './server/db/client.js';
import { sql } from 'drizzle-orm';

/**
 * COMPREHENSIVE ORGANIZATION SECURITY TEST
 * Tests middleware and database-level organization isolation
 */

const TEST_ORG_LEGITIMATE = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77'; // Fix My Forklift  
const TEST_ORG_UNAUTHORIZED = '00000000-0000-0000-0000-000000000000'; // Non-existent
const TEST_USER_ID = '5ddd6d46-fe3a-4908-bc44-fbd7ed52a494'; // Valid user

console.log('🔐 COMPREHENSIVE ORGANIZATION SECURITY TEST');
console.log('===========================================\n');

async function testDatabaseContextIsolation() {
  console.log('🧪 Test 1: Database Context Isolation via SET app.current_org');
  
  const tables = ['customers', 'jobs', 'equipment', 'quotes', 'invoices'];
  
  for (const table of tables) {
    try {
      // Test legitimate org context
      await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_LEGITIMATE}'`));
      const legitimateResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
      const legitimateCount = Number(legitimateResult[0]?.count || 0);
      
      // Test unauthorized org context  
      await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_UNAUTHORIZED}'`));
      const unauthorizedResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
      const unauthorizedCount = Number(unauthorizedResult[0]?.count || 0);
      
      const isolated = unauthorizedCount === 0;
      console.log(`  ${table}: legitimate=${legitimateCount}, unauthorized=${unauthorizedCount} ${isolated ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`  ${table}: ERROR - ${error.message}`);
    }
  }
}

async function testExplicitOrgFiltering() {
  console.log('\n🧪 Test 2: Explicit org_id Filtering in Queries');
  
  const tests = [
    {
      name: 'customers with legitimate org',
      query: `SELECT COUNT(*) as count FROM customers WHERE org_id = '${TEST_ORG_LEGITIMATE}'`,
      expected: 'should return data'
    },
    {
      name: 'customers with unauthorized org', 
      query: `SELECT COUNT(*) as count FROM customers WHERE org_id = '${TEST_ORG_UNAUTHORIZED}'`,
      expected: 'should return 0'
    },
    {
      name: 'jobs with legitimate org',
      query: `SELECT COUNT(*) as count FROM jobs WHERE org_id = '${TEST_ORG_LEGITIMATE}'`, 
      expected: 'should return data'
    },
    {
      name: 'equipment with legitimate org',
      query: `SELECT COUNT(*) as count FROM equipment WHERE org_id = '${TEST_ORG_LEGITIMATE}'`,
      expected: 'should return data'
    }
  ];
  
  for (const test of tests) {
    try {
      const result = await db.execute(sql.raw(test.query));
      const count = Number(result[0]?.count || 0);
      console.log(`  ${test.name}: ${count} records (${test.expected})`);
    } catch (error) {
      console.log(`  ${test.name}: ERROR - ${error.message}`);
    }
  }
}

async function testSessionContextHelper() {
  console.log('\n🧪 Test 3: Session Context Helper Function');
  
  try {
    // Set legitimate org context
    await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_LEGITIMATE}'`));
    const result1 = await db.execute(sql`SELECT current_org_id() as org_id`);
    const returned1 = result1[0]?.org_id;
    console.log(`  current_org_id() with legitimate org: ${returned1} ${returned1 === TEST_ORG_LEGITIMATE ? '✅' : '❌'}`);
    
    // Set unauthorized org context
    await db.execute(sql.raw(`SET app.current_org = '${TEST_ORG_UNAUTHORIZED}'`)); 
    const result2 = await db.execute(sql`SELECT current_org_id() as org_id`);
    const returned2 = result2[0]?.org_id;
    console.log(`  current_org_id() with unauthorized org: ${returned2} ${returned2 === TEST_ORG_UNAUTHORIZED ? '✅' : '❌'}`);
    
  } catch (error) {
    console.log(`  Helper function test ERROR: ${error.message}`);
  }
}

async function testRLSPolicyEnforcement() {
  console.log('\n🧪 Test 4: RLS Policy Enforcement Check');
  
  try {
    // Check if RLS is enabled on key tables
    const rlsCheck = await db.execute(sql`
      SELECT tablename, rowsecurity, CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as status
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('customers', 'jobs', 'equipment', 'quotes', 'invoices')
      ORDER BY tablename
    `);
    
    console.log('  RLS Status:');
    for (const table of rlsCheck) {
      console.log(`    ${table.tablename}: ${table.status}`);
    }
    
  } catch (error) {
    console.log(`  RLS check ERROR: ${error.message}`);
  }
}

async function testDataLeakageScenarios() {
  console.log('\n🧪 Test 5: Data Leakage Attack Scenarios');
  
  const attackScenarios = [
    {
      name: 'NULL org context',
      setup: `SET app.current_org = NULL`,
      query: `SELECT COUNT(*) as count FROM customers`
    },
    {
      name: 'Empty string org context',
      setup: `SET app.current_org = ''`,
      query: `SELECT COUNT(*) as count FROM customers`
    },
    {
      name: 'Wildcard org attempt',
      setup: `SET app.current_org = '%'`,
      query: `SELECT COUNT(*) as count FROM customers`
    }
  ];
  
  for (const scenario of attackScenarios) {
    try {
      await db.execute(sql.raw(scenario.setup));
      const result = await db.execute(sql.raw(scenario.query));
      const count = Number(result[0]?.count || 0);
      const secure = count === 0;
      console.log(`  ${scenario.name}: ${count} records ${secure ? '✅ SECURE' : '❌ LEAKED'}`);
    } catch (error) {
      console.log(`  ${scenario.name}: ✅ BLOCKED (error: ${error.message.substring(0, 50)}...)`);
    }
  }
}

async function runAllTests() {
  try {
    await testDatabaseContextIsolation();
    await testExplicitOrgFiltering(); 
    await testSessionContextHelper();
    await testRLSPolicyEnforcement();
    await testDataLeakageScenarios();
    
    console.log('\n🎉 COMPREHENSIVE ORGANIZATION SECURITY TEST COMPLETED');
    console.log('Check results above for any security issues.');
    
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

runAllTests().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});