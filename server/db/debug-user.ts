import { db } from './client'
import { sql } from 'drizzle-orm'

async function debugUserQuery() {
  console.log('🔍 Debugging user authentication query...')
  
  try {
    // Test 1: Check all users
    console.log('1. All users in database:')
    const allUsers = await db.execute(sql`SELECT email, id, org_id, password_hash FROM users`)
    console.log('Users found:', allUsers.length)
    allUsers.forEach((user, i) => {
      console.log(`  User ${i+1}:`, {
        email: user.email,
        id: user.id,
        orgId: user.org_id,
        hasPassword: !!user.password_hash
      })
    })
    
    // Test 2: Exact query from auth route
    console.log('\n2. Auth route query:')
    const authQuery = await db.execute(sql`
      select id, org_id, email, password_hash, name, role
      from users
      where lower(email) = lower('keith.richmond@live.com')
      order by created_at asc
      limit 1
    `)
    console.log('Auth query result:', authQuery.length, 'rows')
    if (authQuery.length > 0) {
      console.log('Found user:', {
        id: authQuery[0].id,
        email: authQuery[0].email,
        orgId: authQuery[0].org_id,
        hasPassword: !!authQuery[0].password_hash
      })
    }
    
    // Test 3: Simple email search
    console.log('\n3. Simple email search:')
    const simpleQuery = await db.execute(sql`
      SELECT * FROM users WHERE email = 'keith.richmond@live.com'
    `)
    console.log('Simple search result:', simpleQuery.length, 'rows')
    
  } catch (error) {
    console.error('❌ Debug failed:', error)
    throw error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  debugUserQuery()
    .then(() => {
      console.log('Debug completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Debug failed:', error)
      process.exit(1)
    })
}