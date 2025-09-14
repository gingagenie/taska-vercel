import { db } from './client'
import { sql } from 'drizzle-orm'

export async function setupTicketSchema() {
  console.log('🎫 Creating ticket system tables...')
  
  try {
    // Create ticket categories table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ticket_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        description text,
        auto_assign_to_role varchar(50),
        is_active boolean DEFAULT true,
        created_at timestamp DEFAULT now()
      );
      
      CREATE UNIQUE INDEX IF NOT EXISTS ticket_categories_name_unique ON ticket_categories (name);
    `)
    console.log('✅ Ticket categories table created')

    // Create support tickets table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        description text NOT NULL,
        status varchar(50) NOT NULL DEFAULT 'open',
        priority varchar(20) NOT NULL DEFAULT 'medium',
        category_id uuid NOT NULL REFERENCES ticket_categories(id),
        submitted_by uuid NOT NULL REFERENCES users(id),
        assigned_to uuid REFERENCES users(id),
        resolved_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        
        CONSTRAINT support_tickets_status_valid CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        CONSTRAINT support_tickets_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
      );
      
      CREATE INDEX IF NOT EXISTS support_tickets_org_status_idx ON support_tickets (org_id, status);
      CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_idx ON support_tickets (assigned_to);
      CREATE INDEX IF NOT EXISTS support_tickets_category_idx ON support_tickets (category_id);
    `)
    console.log('✅ Support tickets table created')

    // Create ticket messages table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        author_id uuid NOT NULL REFERENCES users(id),
        message text NOT NULL,
        is_internal boolean DEFAULT false,
        created_at timestamp DEFAULT now()
      );
      
      CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);
      CREATE INDEX IF NOT EXISTS ticket_messages_ticket_internal_idx ON ticket_messages (ticket_id, is_internal);
    `)
    console.log('✅ Ticket messages table created')

    // Create ticket assignments table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ticket_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        assigned_to uuid NOT NULL REFERENCES users(id),
        assigned_by uuid NOT NULL REFERENCES users(id),
        assigned_at timestamp DEFAULT now(),
        unassigned_at timestamp
      );
      
      CREATE INDEX IF NOT EXISTS ticket_assignments_ticket_idx ON ticket_assignments (ticket_id, assigned_at);
      CREATE INDEX IF NOT EXISTS ticket_assignments_assigned_to_idx ON ticket_assignments (assigned_to, assigned_at);
    `)
    console.log('✅ Ticket assignments table created')

    console.log('🎉 Ticket schema setup completed!')
    
  } catch (error) {
    console.error('❌ Failed to setup ticket schema:', error)
    throw error
  }
}

export async function seedTicketCategories() {
  console.log('🌱 Seeding default ticket categories...')
  
  try {
    // Insert default ticket categories
    await db.execute(sql`
      INSERT INTO ticket_categories (name, description, auto_assign_to_role)
      VALUES 
        ('Billing & Payments', 'Questions about invoices, payments, and subscription issues', 'billing_team'),
        ('Technical Issues', 'Bug reports, performance issues, and technical problems', 'support_staff'),
        ('Feature Requests', 'Requests for new features or enhancements', 'product_team'),
        ('Bug Reports', 'Software bugs and unexpected behavior', 'support_staff'),
        ('Account Management', 'User management, permissions, and account settings', 'support_staff'),
        ('General Questions', 'General inquiries and how-to questions', 'support_staff')
      ON CONFLICT (name) DO NOTHING;
    `)
    console.log('✅ Default ticket categories seeded')
    
  } catch (error) {
    console.error('❌ Failed to seed ticket categories:', error)
    throw error
  }
}

export async function setupTicketSystem() {
  await setupTicketSchema()
  await seedTicketCategories()
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTicketSystem()
    .then(() => {
      console.log('Ticket system setup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Ticket system setup failed:', error)
      process.exit(1)
    })
}