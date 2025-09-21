import { Router } from 'express';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { 
  organizations, 
  orgSubscriptions, 
  subscriptionPlans, 
  users, 
  usageCounters,
  usagePacks,
  supportTickets
} from '../../shared/schema';
import { eq, and, gte, lte, desc, count } from 'drizzle-orm';

const router = Router();

// All admin routes require authentication and admin privileges
router.use([requireAuth, requireAdmin]);

/**
 * GET /api/admin/dashboard
 * Core business metrics for God Mode dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    console.log('[ADMIN] Dashboard metrics requested');

    // Calculate MRR (Monthly Recurring Revenue)
    const mrrResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(sp.price_monthly_cents), 0) as mrr_cents,
        COUNT(*) as active_subscriptions
      FROM org_subscriptions os
      JOIN subscription_plans sp ON os.plan_id = sp.id  
      WHERE os.status = 'active'
    `);

    const mrr = mrrResult[0] as any;
    const mrrAud = Math.round((mrr.mrr_cents || 0) / 100);

    // Count active organizations
    const activeOrgsResult = await db.execute(sql`
      SELECT COUNT(*) as active_orgs
      FROM org_subscriptions 
      WHERE status IN ('active', 'trial')
    `);

    const activeOrgs = (activeOrgsResult[0] as any).active_orgs || 0;

    // Calculate churn rate (last 30 days)
    const churnResult = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at >= NOW() - INTERVAL '30 days') as churned_last_30,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days') as total_changes_last_30,
        COUNT(*) FILTER (WHERE status = 'canceled') as total_churned,
        COUNT(*) as total_subscriptions
      FROM org_subscriptions
    `);

    const churn = churnResult[0] as any;
    const churnRate30Day = churn.total_changes_last_30 > 0 
      ? Math.round((churn.churned_last_30 / churn.total_changes_last_30) * 100)
      : 0;

    // Trial vs Paid breakdown
    const subscriptionBreakdown = await db.execute(sql`
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(sp.price_monthly_cents), 0) as revenue_cents
      FROM org_subscriptions os
      LEFT JOIN subscription_plans sp ON os.plan_id = sp.id
      WHERE os.status IN ('active', 'trial', 'past_due', 'canceled')
      GROUP BY status
    `);

    // Recent activity (last 7 days)
    const recentActivity = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_orgs
      FROM organizations 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Support ticket counts
    const supportStats = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
        COUNT(*) FILTER (WHERE status = 'closed' AND updated_at >= NOW() - INTERVAL '7 days') as resolved_this_week,
        COUNT(*) as total_tickets
      FROM support_tickets
    `);

    const dashboard = {
      mrr: {
        amount_aud: mrrAud,
        active_subscriptions: mrr.active_subscriptions || 0
      },
      organizations: {
        active_count: activeOrgs,
        total_count: churn.total_subscriptions || 0
      },
      churn: {
        rate_30_day_percent: churnRate30Day,
        churned_last_30: churn.churned_last_30 || 0,
        total_churned: churn.total_churned || 0
      },
      subscription_breakdown: subscriptionBreakdown.map((sub: any) => ({
        status: sub.status,
        count: sub.count,
        revenue_aud: Math.round((sub.revenue_cents || 0) / 100)
      })),
      recent_activity: recentActivity.map(activity => ({
        date: activity.date,
        new_organizations: activity.new_orgs
      })),
      support: {
        open_tickets: supportStats[0]?.open_tickets || 0,
        resolved_this_week: supportStats[0]?.resolved_this_week || 0,
        total_tickets: supportStats[0]?.total_tickets || 0
      },
      generated_at: new Date().toISOString()
    };

    console.log(`[ADMIN] Dashboard metrics: MRR $${mrrAud} AUD, ${activeOrgs} active orgs, ${churnRate30Day}% churn`);
    res.json(dashboard);

  } catch (error) {
    console.error('[ADMIN] Error fetching dashboard metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/organizations
 * List all organizations with subscription details
 */
router.get('/organizations', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;
    const status = req.query.status as string;
    
    const offset = (page - 1) * limit;

    // Build base query
    let whereConditions = sql`1=1`;
    
    if (search) {
      whereConditions = sql`${whereConditions} AND (
        o.name ILIKE ${'%' + search + '%'} OR 
        o.abn ILIKE ${'%' + search + '%'}
      )`;
    }
    
    if (status && ['active', 'trial', 'past_due', 'canceled'].includes(status)) {
      whereConditions = sql`${whereConditions} AND os.status = ${status}`;
    }

    // Get organizations with subscription details
    const orgResults = await db.execute(sql`
      SELECT 
        o.id,
        o.name,
        o.abn,
        o.created_at,
        os.status as subscription_status,
        os.plan_id,
        sp.name as plan_name,
        sp.price_monthly_cents,
        os.trial_end,
        os.current_period_start,
        os.current_period_end,
        os.stripe_customer_id,
        os.stripe_subscription_id,
        COUNT(u.id) as user_count,
        -- Usage stats from current period
        uc.sms_sent,
        uc.emails_sent
      FROM organizations o
      LEFT JOIN org_subscriptions os ON o.id = os.org_id
      LEFT JOIN subscription_plans sp ON os.plan_id = sp.id
      LEFT JOIN users u ON o.id = u.org_id
      LEFT JOIN usage_counters uc ON o.id = uc.org_id 
        AND uc.period_start <= NOW() 
        AND uc.period_end > NOW()
      WHERE ${whereConditions}
      GROUP BY o.id, o.name, o.abn, o.created_at, os.status, os.plan_id, 
               sp.name, sp.price_monthly_cents, os.trial_end, 
               os.current_period_start, os.current_period_end,
               os.stripe_customer_id, os.stripe_subscription_id,
               uc.sms_sent, uc.emails_sent
      ORDER BY o.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Get total count for pagination
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT o.id) as total
      FROM organizations o
      LEFT JOIN org_subscriptions os ON o.id = os.org_id
      WHERE ${whereConditions}
    `);

    const totalCount = (countResult[0] as any)?.total || 0;
    const totalPages = Math.ceil(Number(totalCount) / limit);

    const organizations = orgResults.map((org: any) => ({
      id: org.id,
      name: org.name,
      abn: org.abn,
      created_at: org.created_at,
      subscription: {
        status: org.subscription_status,
        plan_id: org.plan_id,
        plan_name: org.plan_name,
        monthly_revenue_aud: org.price_monthly_cents ? Math.round(Number(org.price_monthly_cents) / 100) : 0,
        trial_end: org.trial_end,
        current_period_start: org.current_period_start,
        current_period_end: org.current_period_end,
        stripe_customer_id: org.stripe_customer_id,
        stripe_subscription_id: org.stripe_subscription_id
      },
      metrics: {
        user_count: org.user_count || 0,
        sms_sent: org.sms_sent || 0,
        emails_sent: org.emails_sent || 0
      }
    }));

    res.json({
      organizations,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });

  } catch (error) {
    console.error('[ADMIN] Error fetching organizations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch organizations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/organization/:id
 * Get detailed view of a specific organization
 */
router.get('/organization/:id', async (req, res) => {
  try {
    const orgId = req.params.id;

    // Get organization details
    const orgDetails = await db.execute(sql`
      SELECT 
        o.*,
        os.status as subscription_status,
        os.plan_id,
        sp.name as plan_name,
        sp.price_monthly_cents,
        sp.features,
        os.trial_end,
        os.current_period_start,
        os.current_period_end,
        os.stripe_customer_id,
        os.stripe_subscription_id,
        os.created_at as subscription_created_at,
        os.updated_at as subscription_updated_at
      FROM organizations o
      LEFT JOIN org_subscriptions os ON o.id = os.org_id
      LEFT JOIN subscription_plans sp ON os.plan_id = sp.id
      WHERE o.id = ${orgId}
    `);

    if (orgDetails.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgDetails[0] as any;

    // Get users
    const users = await db.execute(sql`
      SELECT id, name, email, role, phone, created_at
      FROM users 
      WHERE org_id = ${orgId}
      ORDER BY created_at DESC
    `);

    // Get usage history (last 6 months)
    const usageHistory = await db.execute(sql`
      SELECT 
        period_start,
        period_end,
        sms_sent,
        emails_sent
      FROM usage_counters 
      WHERE org_id = ${orgId}
        AND period_start >= NOW() - INTERVAL '6 months'
      ORDER BY period_start DESC
    `);

    // Get purchased packs
    const packs = await db.execute(sql`
      SELECT 
        pack_type,
        quantity,
        used_quantity,
        purchased_at,
        expires_at,
        status,
        stripe_payment_id
      FROM usage_packs
      WHERE org_id = ${orgId}
      ORDER BY purchased_at DESC
    `);

    // Get support tickets
    const supportTickets = await db.execute(sql`
      SELECT 
        id,
        title,
        status,
        priority,
        created_at,
        updated_at
      FROM support_tickets
      WHERE org_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const organizationDetails = {
      organization: {
        id: org.id,
        name: org.name,
        abn: org.abn,
        street: org.street,
        suburb: org.suburb,
        state: org.state,
        postcode: org.postcode,
        created_at: org.created_at
      },
      subscription: {
        status: org.subscription_status,
        plan_id: org.plan_id,
        plan_name: org.plan_name,
        monthly_revenue_aud: org.price_monthly_cents ? Math.round(Number(org.price_monthly_cents) / 100) : 0,
        features: org.features,
        trial_end: org.trial_end,
        current_period_start: org.current_period_start,
        current_period_end: org.current_period_end,
        stripe_customer_id: org.stripe_customer_id,
        stripe_subscription_id: org.stripe_subscription_id,
        created_at: org.subscription_created_at,
        updated_at: org.subscription_updated_at
      },
      users: users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        created_at: user.created_at
      })),
      usage_history: usageHistory.map(usage => ({
        period_start: usage.period_start,
        period_end: usage.period_end,
        sms_sent: usage.sms_sent,
        emails_sent: usage.emails_sent
      })),
      purchased_packs: packs.map((pack: any) => ({
        type: pack.pack_type,
        quantity: pack.quantity,
        used: pack.used_quantity,
        remaining: Number(pack.quantity) - Number(pack.used_quantity),
        purchased_at: pack.purchased_at,
        expires_at: pack.expires_at,
        status: pack.status,
        stripe_payment_id: pack.stripe_payment_id
      })),
      support_tickets: supportTickets.map(ticket => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at
      }))
    };

    res.json(organizationDetails);

  } catch (error) {
    console.error('[ADMIN] Error fetching organization details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch organization details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;