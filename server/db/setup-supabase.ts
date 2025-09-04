import { db } from './client'
import { sql } from 'drizzle-orm'

export async function setupSupabaseSchema() {
  console.log('🏗️  Creating Supabase tables...')
  
  try {
    // Create session table for express sessions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS session (
        sid varchar NOT NULL COLLATE "default",
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      )
      WITH (OIDS=FALSE);
      
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_session_sid" ON session ("sid");
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session ("expire");
    `)
    console.log('✅ Session table created')

    // Create organizations table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS orgs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        abn varchar(50),
        street varchar(255),
        suburb varchar(100),
        state varchar(50),
        postcode varchar(10),
        logo_url varchar(500),
        default_labour_rate_cents integer DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `)
    console.log('✅ Organizations table created')

    // Create users table  
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid REFERENCES orgs(id),
        email varchar(255) NOT NULL UNIQUE,
        name varchar(255),
        role varchar(100),
        phone varchar(50),
        avatar_url varchar(500),
        created_at timestamp DEFAULT now()
      )
    `)
    console.log('✅ Users table created')

    // Create memberships table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id),
        org_id uuid REFERENCES orgs(id),
        role varchar(50) DEFAULT 'member',
        created_at timestamp DEFAULT now()
      )
    `)
    console.log('✅ Memberships table created')

    // Create customers table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL,
        name varchar(255) NOT NULL,
        contact_name text,
        email varchar(255),
        phone varchar(50),
        address text,
        street text,
        suburb text,
        state text,
        postcode text,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)
    console.log('✅ Customers table created')

    // Create jobs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL,
        customer_id uuid REFERENCES customers(id),
        title varchar(255) NOT NULL,
        description text,
        status varchar(50) DEFAULT 'new',
        notes text,
        scheduled_at timestamp,
        created_by uuid REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `)
    console.log('✅ Jobs table created')

    console.log('🎉 Supabase schema setup completed!')
    
  } catch (error) {
    console.error('❌ Failed to setup Supabase schema:', error)
    throw error
  }
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSupabaseSchema()
    .then(() => {
      console.log('Schema setup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Schema setup failed:', error)
      process.exit(1)
    })
}