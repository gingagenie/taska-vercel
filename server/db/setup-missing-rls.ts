import { db } from './client'
import { sql } from 'drizzle-orm'

/**
 * Enhanced RLS Setup - Cover Missing Critical Tables
 * 
 * This script adds RLS policies to tables that were missing coverage
 * identified in the comprehensive security audit.
 */
export async function setupMissingRLSPolicies() {
  console.log('🔒 Setting up MISSING Row Level Security policies...')
  console.log('Critical tables identified in security audit')
  
  try {
    // First, enable RLS on all missing tables
    const missingTables = [
      'invoices', 'quotes', 'item_presets', 'invoice_lines', 'quote_lines',
      'notification_history', 'sms_usage', 'usage_counters', 
      'usage_pack_reservations', 'support_tickets'
    ]
    
    console.log('\n📋 Enabling RLS on missing tables...')
    for (const table of missingTables) {
      try {
        await db.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
        console.log(`✅ RLS enabled on ${table}`)
      } catch (error) {
        console.log(`⚠️ RLS already enabled or error on ${table}: ${error}`)
      }
    }

    // Drop existing policies if they exist (for idempotency)
    console.log('\n🧹 Dropping existing policies for idempotency...')
    const dropPolicies = [
      'DROP POLICY IF EXISTS "invoice_org_isolation" ON invoices',
      'DROP POLICY IF EXISTS "quote_org_isolation" ON quotes',
      'DROP POLICY IF EXISTS "item_preset_org_isolation" ON item_presets',
      'DROP POLICY IF EXISTS "invoice_line_org_isolation" ON invoice_lines',
      'DROP POLICY IF EXISTS "quote_line_org_isolation" ON quote_lines',
      'DROP POLICY IF EXISTS "notification_history_org_isolation" ON notification_history',
      'DROP POLICY IF EXISTS "sms_usage_org_isolation" ON sms_usage',
      'DROP POLICY IF EXISTS "usage_counter_org_isolation" ON usage_counters',
      'DROP POLICY IF EXISTS "usage_pack_reservation_org_isolation" ON usage_pack_reservations',
      'DROP POLICY IF EXISTS "support_ticket_org_isolation" ON support_tickets',
      'DROP POLICY IF EXISTS "support_ticket_staff_access" ON support_tickets'
    ]
    
    for (const dropSql of dropPolicies) {
      await db.execute(sql.raw(dropSql))
    }
    console.log('✅ Existing policies dropped')

    // INVOICES: Critical financial data - must be isolated by org
    console.log('\n💰 Creating invoice isolation policies...')
    await db.execute(sql`
      CREATE POLICY "invoice_org_isolation" ON invoices
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Invoice org isolation policy created')

    // QUOTES: Critical financial data - must be isolated by org
    await db.execute(sql`
      CREATE POLICY "quote_org_isolation" ON quotes
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Quote org isolation policy created')

    // ITEM PRESETS: Business-specific templates - must be isolated by org
    await db.execute(sql`
      CREATE POLICY "item_preset_org_isolation" ON item_presets
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Item preset org isolation policy created')

    // INVOICE LINES: Line items belong to invoices, inherit org isolation
    await db.execute(sql`
      CREATE POLICY "invoice_line_org_isolation" ON invoice_lines
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Invoice line org isolation policy created')

    // QUOTE LINES: Line items belong to quotes, inherit org isolation
    await db.execute(sql`
      CREATE POLICY "quote_line_org_isolation" ON quote_lines
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Quote line org isolation policy created')

    // NOTIFICATION HISTORY: Audit trail - must be isolated by org
    await db.execute(sql`
      CREATE POLICY "notification_history_org_isolation" ON notification_history
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Notification history org isolation policy created')

    // SMS USAGE: Billing data - critical isolation by org
    await db.execute(sql`
      CREATE POLICY "sms_usage_org_isolation" ON sms_usage
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ SMS usage org isolation policy created')

    // USAGE COUNTERS: Billing and quota tracking - critical isolation
    await db.execute(sql`
      CREATE POLICY "usage_counter_org_isolation" ON usage_counters
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Usage counter org isolation policy created')

    // USAGE PACK RESERVATIONS: Billing safety - critical isolation
    await db.execute(sql`
      CREATE POLICY "usage_pack_reservation_org_isolation" ON usage_pack_reservations
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Usage pack reservation org isolation policy created')

    // SUPPORT TICKETS: Customer support data - isolated by customer org
    await db.execute(sql`
      CREATE POLICY "support_ticket_org_isolation" ON support_tickets
      FOR ALL
      USING (org_id = current_org_id())
    `)
    console.log('✅ Support ticket org isolation policy created')

    // SUPPORT TICKETS: Support staff access - bypass org isolation for staff
    await db.execute(sql`
      CREATE POLICY "support_ticket_staff_access" ON support_tickets
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = current_setting('app.current_user_id', true)::uuid
          AND users.role = 'support_staff'
        )
      )
    `)
    console.log('✅ Support ticket staff access policy created')

    console.log('\n🎉 Missing RLS policies setup completed!')
    console.log('🔐 All critical tables now have multi-tenant isolation!')
    
  } catch (error) {
    console.error('❌ Failed to setup missing RLS policies:', error)
    throw error
  }
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupMissingRLSPolicies()
    .then(() => {
      console.log('Missing RLS policies setup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Missing RLS policies setup failed:', error)
      process.exit(1)
    })
}