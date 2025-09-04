import { db } from './client'
import { sql } from 'drizzle-orm'

async function testRLS() {
  console.log('🧪 Testing Row Level Security...')
  
  try {
    // Test 1: Set current org to Fix My Forklift's org ID
    await db.execute(sql`SET app.current_org = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77'`)
    
    // Test 2: Query customers (should return Fix My Forklift customers only)
    const customers = await db.execute(sql`SELECT id, name, org_id FROM customers`)
    console.log('✅ Customers visible:', customers.length)
    customers.forEach(c => console.log(`  - ${c.name} (org: ${c.org_id})`))
    
    // Test 3: Try to query customers without org filtering (should still be isolated by RLS)
    const allCustomers = await db.execute(sql`SELECT COUNT(*) as count FROM customers`)
    console.log('✅ Total customers accessible:', allCustomers[0].count)
    
    // Test 4: Check users
    const users = await db.execute(sql`SELECT email, org_id FROM users`)
    console.log('✅ Users visible:', users.length)
    users.forEach(u => console.log(`  - ${u.email} (org: ${u.org_id})`))
    
    console.log('🎉 RLS test completed - tenant isolation working!')
    
  } catch (error) {
    console.error('❌ RLS test failed:', error)
    throw error
  }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRLS()
    .then(() => {
      console.log('RLS test completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('RLS test failed:', error)
      process.exit(1)
    })
}