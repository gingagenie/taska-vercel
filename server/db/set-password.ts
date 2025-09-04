import { db } from './client'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

async function setUserPassword() {
  console.log('🔐 Setting up password for keith.richmond@live.com...')
  
  try {
    // First add password_hash column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text
    `)
    
    // Then check if user exists and has password
    const result = await db.execute(sql`
      SELECT id, email, password_hash FROM users WHERE email = 'keith.richmond@live.com'
    `)
    
    console.log('Query result:', result)
    const user = result[0] as any
    if (!user) {
      console.error('❌ User keith.richmond@live.com not found!')
      return
    }
    
    console.log('✅ User found:', { email: user.email, hasPassword: !!user.password_hash })
    
    if (user.password_hash) {
      console.log('✅ User already has a password set')
      return
    }
    
    // Set default password: "password123"
    const defaultPassword = "password123"
    const passwordHash = await bcrypt.hash(defaultPassword, 10)
    
    await db.execute(sql`
      UPDATE users 
      SET password_hash = ${passwordHash}
      WHERE email = 'keith.richmond@live.com'
    `)
    
    console.log('✅ Password set successfully!')
    console.log('📧 Email: keith.richmond@live.com')
    console.log('🔑 Password: password123')
    
  } catch (error) {
    console.error('❌ Failed to set password:', error)
    throw error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setUserPassword()
    .then(() => {
      console.log('Password setup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Password setup failed:', error)
      process.exit(1)
    })
}