import { db } from './client'
import * as schema from '../../shared/schema'

export async function seedInitialData() {
  console.log('🌱 Seeding initial data...')
  
  try {
    // 1. Create Fix My Forklift organization
    const [org] = await db.insert(schema.organizations).values({
      name: "Fix My Forklift",
      abn: "12345678901", 
      street: "123 Business St",
      suburb: "Melbourne",
      state: "VIC", 
      postcode: "3000",
      defaultLabourRateCents: 12000 // $120/hour
    }).returning()
    
    console.log(`✅ Created organization: ${org.name}`)
    
    // 2. Create keith.richmond@live.com user
    const [user] = await db.insert(schema.users).values({
      orgId: org.id,
      email: "keith.richmond@live.com",
      name: "Keith Richmond",
      role: "admin",
      phone: "+61400123456"
    }).returning()
    
    console.log(`✅ Created user: ${user.email}`)
    
    // 3. Create membership
    await db.insert(schema.memberships).values({
      userId: user.id,
      orgId: org.id,
      role: "admin"
    })
    
    console.log('✅ Created membership')
    
    // 4. Create sample customer
    const [customer] = await db.insert(schema.customers).values({
      orgId: org.id,
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
    
    // 5. Create sample job
    const [job] = await db.insert(schema.jobs).values({
      orgId: org.id,
      customerId: customer.id,
      title: "Forklift Service - Annual Maintenance",
      description: "Annual service and safety check for Toyota forklift",
      status: "scheduled",
      createdBy: user.id,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    }).returning()
    
    console.log('✅ Created sample job')
    
    console.log('🎉 Initial data seeding completed!')
    
    return {
      orgId: org.id,
      userId: user.id,
      customerId: customer.id,
      jobId: job.id
    }
    
  } catch (error) {
    console.error('❌ Failed to seed data:', error)
    throw error
  }
}

// Run the seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInitialData()
    .then((result) => {
      console.log('Seeding completed:', result)
      process.exit(0)
    })
    .catch((error) => {
      console.error('Seeding failed:', error)
      process.exit(1)
    })
}