import { supabase, db } from './supabase'
import * as schema from '../../shared/schema'

// Migration helper to set up initial data in Supabase
export async function migrateToSupabase() {
  try {
    console.log('🚀 Starting migration to Supabase...')
    
    // 1. Create Fix My Forklift organization
    const orgResult = await db.insert(schema.organizations).values({
      name: "Fix My Forklift",
      abn: "12345678901", 
      street: "123 Business St",
      suburb: "Melbourne",
      state: "VIC", 
      postcode: "3000",
      defaultLabourRateCents: 12000 // $120/hour
    }).returning()
    
    const orgId = orgResult[0].id
    console.log(`✅ Created organization: ${orgId}`)
    
    // 2. Create keith.richmond@live.com user
    const userResult = await db.insert(schema.users).values({
      orgId: orgId,
      email: "keith.richmond@live.com",
      name: "Keith Richmond",
      role: "admin",
      phone: "+61400123456"
    }).returning()
    
    const userId = userResult[0].id
    console.log(`✅ Created user: keith.richmond@live.com`)
    
    // 3. Create membership
    await db.insert(schema.memberships).values({
      userId: userId,
      orgId: orgId,
      role: "admin"
    })
    
    console.log('✅ Created membership')
    
    // 4. Create some sample data
    const customerResult = await db.insert(schema.customers).values({
      orgId: orgId,
      name: "ABC Manufacturing",
      contactName: "John Smith",
      email: "john@abcmfg.com",
      phone: "+61400987654",
      street: "456 Factory Rd",
      suburb: "Richmond",
      state: "VIC",
      postcode: "3121"
    }).returning()
    
    console.log('✅ Created sample customer')
    
    console.log('🎉 Migration completed successfully!')
    
    return {
      orgId,
      userId,
      customerId: customerResult[0].id
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}