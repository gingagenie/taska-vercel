import { db } from './client'
import { sql } from 'drizzle-orm'

export async function setupRowLevelSecurity() {
  console.log('🔒 Setting up Row Level Security policies...')
  
  try {
    // Create helper function for getting current org from session
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_org', true)::uuid;
      EXCEPTION
        WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `)
    console.log('✅ Helper function created')

    // Enable RLS on all tenant tables
    const tables = ['orgs', 'users', 'memberships', 'customers', 'jobs', 'support_tickets', 'ticket_messages', 'ticket_assignments']
    
    for (const table of tables) {
      await db.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
      console.log(`✅ RLS enabled on ${table}`)
    }

    // Drop existing policies if they exist (for idempotency)
    const dropPolicies = [
      'DROP POLICY IF EXISTS "org_isolation" ON orgs',
      'DROP POLICY IF EXISTS "user_org_isolation" ON users', 
      'DROP POLICY IF EXISTS "membership_org_isolation" ON memberships',
      'DROP POLICY IF EXISTS "customer_org_isolation" ON customers',
      'DROP POLICY IF EXISTS "job_org_isolation" ON jobs',
      'DROP POLICY IF EXISTS "support_ticket_org_isolation" ON support_tickets',
      'DROP POLICY IF EXISTS "support_ticket_staff_access" ON support_tickets',
      'DROP POLICY IF EXISTS "ticket_message_org_isolation" ON ticket_messages',
      'DROP POLICY IF EXISTS "ticket_message_staff_access" ON ticket_messages',
      'DROP POLICY IF EXISTS "ticket_assignment_org_isolation" ON ticket_assignments',
      'DROP POLICY IF EXISTS "ticket_assignment_staff_access" ON ticket_assignments'
    ]
    
    for (const dropSql of dropPolicies) {
      await db.execute(sql.raw(dropSql))
    }
    console.log('✅ Existing policies dropped')

    // Organizations: Users can only access their own org
    await db.execute(sql`
      CREATE POLICY "org_isolation" ON orgs
      FOR ALL
      USING (id = current_org_id())
    `)
    console.log('✅ Organization isolation policy created')

    // Users: Can only access users in their organization  
    await db.execute(sql`
      CREATE POLICY "user_org_isolation" ON users
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ User isolation policy created')

    // Memberships: Can only access memberships in their organization
    await db.execute(sql`
      CREATE POLICY "membership_org_isolation" ON memberships
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Membership isolation policy created')

    // Customers: Can only access customers in their organization
    await db.execute(sql`
      CREATE POLICY "customer_org_isolation" ON customers
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Customer isolation policy created')

    // Jobs: Can only access jobs in their organization
    await db.execute(sql`
      CREATE POLICY "job_org_isolation" ON jobs
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Job isolation policy created')

    // Support Tickets: Customer orgs can only see their own tickets
    await db.execute(sql`
      CREATE POLICY "support_ticket_org_isolation" ON support_tickets
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Support ticket org isolation policy created')

    // Support Tickets: Support staff can see all tickets (bypass org isolation)
    await db.execute(sql`
      CREATE POLICY "support_ticket_staff_access" ON support_tickets
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'support_staff'
        )
      )
    `)
    console.log('✅ Support ticket staff access policy created')

    // Ticket Messages: Customer orgs can only see messages for their tickets
    await db.execute(sql`
      CREATE POLICY "ticket_message_org_isolation" ON ticket_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM support_tickets 
          WHERE support_tickets.id = ticket_messages.ticket_id
          AND support_tickets.org_id = current_org_id()
        )
      )
    `)
    console.log('✅ Ticket message org isolation policy created')

    // Ticket Messages: Support staff can see all ticket messages
    await db.execute(sql`
      CREATE POLICY "ticket_message_staff_access" ON ticket_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'support_staff'
        )
      )
    `)
    console.log('✅ Ticket message staff access policy created')

    // Ticket Assignments: Customer orgs can see assignments for their tickets
    await db.execute(sql`
      CREATE POLICY "ticket_assignment_org_isolation" ON ticket_assignments
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM support_tickets 
          WHERE support_tickets.id = ticket_assignments.ticket_id
          AND support_tickets.org_id = current_org_id()
        )
      )
    `)
    console.log('✅ Ticket assignment org isolation policy created')

    // Ticket Assignments: Support staff can see all ticket assignments
    await db.execute(sql`
      CREATE POLICY "ticket_assignment_staff_access" ON ticket_assignments
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'support_staff'
        )
      )
    `)
    console.log('✅ Ticket assignment staff access policy created')

    console.log('🎉 Row Level Security setup completed!')
    
  } catch (error) {
    console.error('❌ Failed to setup RLS:', error)
    throw error
  }
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupRowLevelSecurity()
    .then(() => {
      console.log('RLS setup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('RLS setup failed:', error)
      process.exit(1)
    })
}