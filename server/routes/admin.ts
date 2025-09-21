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
      FROM orgs 
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
      FROM orgs o
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
      FROM orgs o
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
      FROM orgs o
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

/**
 * PUT /api/admin/organization/:id/subscription
 * Manually update organization subscription
 */
router.put('/organization/:id/subscription', async (req, res) => {
  try {
    const orgId = req.params.id;
    const { plan_id, status, extend_trial_days, notes } = req.body;

    console.log(`[ADMIN] Manual subscription update for org ${orgId}:`, { plan_id, status, extend_trial_days });

    // Validate inputs
    if (plan_id && !['solo', 'pro', 'enterprise'].includes(plan_id)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    if (status && !['active', 'trial', 'past_due', 'canceled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get current subscription
    const currentSub = await db.execute(sql`
      SELECT * FROM org_subscriptions 
      WHERE org_id = ${orgId}
    `);

    if (currentSub.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const current = currentSub[0] as any;
    
    // Prepare update object
    const updates: any = {
      updated_at: new Date()
    };

    if (plan_id) {
      updates.plan_id = plan_id;
    }

    if (status) {
      updates.status = status;
    }

    // Handle trial extension
    if (extend_trial_days && extend_trial_days > 0) {
      const currentTrialEnd = current.trial_end ? new Date(current.trial_end) : new Date();
      const extendedTrialEnd = new Date(currentTrialEnd.getTime() + (extend_trial_days * 24 * 60 * 60 * 1000));
      updates.trial_end = extendedTrialEnd;
      
      // If extending trial, set status to trial
      updates.status = 'trial';
    }

    // Update subscription using dynamic query construction
    const updateFields = Object.keys(updates);
    const updateValues = Object.values(updates);
    
    const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const updateResult = await db.execute(
      sql.raw(`
        UPDATE org_subscriptions 
        SET ${setClause}
        WHERE org_id = $1
        RETURNING *
      `)
    );

    // Log the admin action
    await db.execute(sql`
      INSERT INTO admin_actions (
        admin_user_id, 
        action_type, 
        target_org_id, 
        details, 
        notes,
        created_at
      ) VALUES (
        ${req.adminUser?.id},
        'subscription_update',
        ${orgId},
        ${JSON.stringify({ 
          previous: { plan_id: current.plan_id, status: current.status },
          updated: updates 
        })},
        ${notes || null},
        NOW()
      )
    `);

    const updatedSubscription = updateResult[0];

    console.log(`[ADMIN] Subscription updated successfully for org ${orgId}`);
    res.json({
      success: true,
      subscription: updatedSubscription,
      message: 'Subscription updated successfully'
    });

  } catch (error) {
    console.error('[ADMIN] Error updating subscription:', error);
    res.status(500).json({ 
      error: 'Failed to update subscription',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/admin/organization/:id/refund
 * Process refund for organization
 */
router.post('/organization/:id/refund', async (req, res) => {
  try {
    const orgId = req.params.id;
    const { amount_cents, reason, stripe_refund } = req.body;

    if (!amount_cents || amount_cents <= 0) {
      return res.status(400).json({ error: 'Valid refund amount required' });
    }

    console.log(`[ADMIN] Processing refund for org ${orgId}: $${amount_cents/100} AUD`);

    // Get organization and subscription details
    const orgDetails = await db.execute(sql`
      SELECT o.name, os.stripe_customer_id, os.stripe_subscription_id
      FROM orgs o
      LEFT JOIN org_subscriptions os ON o.id = os.org_id
      WHERE o.id = ${orgId}
    `);

    if (orgDetails.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgDetails[0] as any;

    // Process Stripe refund if requested
    let stripeRefundId = null;
    if (stripe_refund && org.stripe_customer_id) {
      try {
        // This would integrate with Stripe API - placeholder for now
        console.log(`[ADMIN] Would process Stripe refund for customer ${org.stripe_customer_id}`);
        stripeRefundId = `refund_placeholder_${Date.now()}`;
      } catch (stripeError) {
        console.error('[ADMIN] Stripe refund failed:', stripeError);
        return res.status(500).json({ error: 'Stripe refund processing failed' });
      }
    }

    // Log the refund action
    await db.execute(sql`
      INSERT INTO admin_actions (
        admin_user_id,
        action_type,
        target_org_id,
        details,
        notes,
        created_at
      ) VALUES (
        ${req.adminUser?.id},
        'refund_processed',
        ${orgId},
        ${JSON.stringify({
          amount_cents,
          stripe_refund_id: stripeRefundId,
          stripe_customer_id: org.stripe_customer_id
        })},
        ${reason || 'Admin-initiated refund'},
        NOW()
      )
    `);

    console.log(`[ADMIN] Refund processed for org ${orgId}: $${amount_cents/100} AUD`);
    res.json({
      success: true,
      refund: {
        amount_cents,
        amount_aud: Math.round(amount_cents / 100),
        stripe_refund_id: stripeRefundId,
        reason: reason || 'Admin-initiated refund'
      },
      message: 'Refund processed successfully'
    });

  } catch (error) {
    console.error('[ADMIN] Error processing refund:', error);
    res.status(500).json({ 
      error: 'Failed to process refund',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/admin/organization/:id/suspend
 * Suspend or unsuspend organization account
 */
router.post('/organization/:id/suspend', async (req, res) => {
  try {
    const orgId = req.params.id;
    const { suspend, reason } = req.body;

    console.log(`[ADMIN] ${suspend ? 'Suspending' : 'Unsuspending'} org ${orgId}`);

    // Update organization suspension status
    await db.execute(sql`
      UPDATE orgs 
      SET 
        suspended = ${suspend || false},
        suspension_reason = ${suspend ? (reason || 'Admin action') : null},
        updated_at = NOW()
      WHERE id = ${orgId}
    `);

    // If suspending, also update subscription status
    if (suspend) {
      await db.execute(sql`
        UPDATE org_subscriptions 
        SET status = 'suspended', updated_at = NOW()
        WHERE org_id = ${orgId}
      `);
    } else {
      // When unsuspending, restore to active status
      await db.execute(sql`
        UPDATE org_subscriptions 
        SET status = 'active', updated_at = NOW()
        WHERE org_id = ${orgId}
      `);
    }

    // Log the admin action
    await db.execute(sql`
      INSERT INTO admin_actions (
        admin_user_id,
        action_type,
        target_org_id,
        details,
        notes,
        created_at
      ) VALUES (
        ${req.adminUser?.id},
        ${suspend ? 'account_suspended' : 'account_unsuspended'},
        ${orgId},
        ${JSON.stringify({ suspended: suspend })},
        ${reason || null},
        NOW()
      )
    `);

    console.log(`[ADMIN] Account ${suspend ? 'suspended' : 'unsuspended'} for org ${orgId}`);
    res.json({
      success: true,
      action: suspend ? 'suspended' : 'unsuspended',
      reason: reason || 'Admin action',
      message: `Account ${suspend ? 'suspended' : 'unsuspended'} successfully`
    });

  } catch (error) {
    console.error('[ADMIN] Error updating suspension status:', error);
    res.status(500).json({ 
      error: 'Failed to update suspension status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/analytics/overview
 * Advanced analytics overview
 */
router.get('/analytics/overview', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || '30d';
    
    // Calculate date range based on timeframe
    let dateFilter = '';
    switch (timeframe) {
      case '7d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
        break;
      case '1y':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 year'";
        break;
      default:
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    }

    // Customer Lifetime Value (CLV) calculation
    const clvData = await db.execute(sql`
      SELECT 
        AVG(revenue_per_org) as avg_clv,
        COUNT(*) as total_orgs
      FROM (
        SELECT 
          os.org_id,
          SUM(sp.price_monthly_cents * 
            EXTRACT(EPOCH FROM (
              COALESCE(os.current_period_end, NOW()) - os.created_at
            )) / (30 * 24 * 3600)
          ) as revenue_per_org
        FROM org_subscriptions os
        JOIN subscription_plans sp ON os.plan_id = sp.id
        WHERE os.status IN ('active', 'canceled') ${sql.raw(dateFilter)}
        GROUP BY os.org_id
      ) org_revenues
    `);

    // Usage trends
    const usageTrends = await db.execute(sql`
      SELECT 
        DATE_TRUNC('week', period_start) as week,
        AVG(sms_sent) as avg_sms_per_week,
        AVG(emails_sent) as avg_emails_per_week,
        COUNT(DISTINCT org_id) as active_orgs
      FROM usage_counters
      WHERE period_start >= NOW() - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week DESC
    `);

    // Support ticket correlation with churn
    const supportCorrelation = await db.execute(sql`
      SELECT 
        COUNT(st.id) as ticket_count,
        COUNT(CASE WHEN os.status = 'canceled' THEN 1 END) as churned_orgs,
        COUNT(DISTINCT st.org_id) as orgs_with_tickets
      FROM support_tickets st
      LEFT JOIN org_subscriptions os ON st.org_id = os.org_id
      WHERE st.created_at >= NOW() - INTERVAL '90 days'
    `);

    // Revenue by plan over time
    const revenueByPlan = await db.execute(sql`
      SELECT 
        sp.name as plan_name,
        DATE_TRUNC('month', os.created_at) as month,
        COUNT(*) as subscriptions,
        SUM(sp.price_monthly_cents) as monthly_revenue_cents
      FROM org_subscriptions os
      JOIN subscription_plans sp ON os.plan_id = sp.id
      WHERE os.created_at >= NOW() - INTERVAL '6 months'
        AND os.status IN ('active', 'trial')
      GROUP BY sp.name, month
      ORDER BY month DESC, plan_name
    `);

    const analytics = {
      customer_lifetime_value: {
        average_clv_aud: clvData[0] ? Math.round((clvData[0] as any).avg_clv / 100) : 0,
        total_organizations: clvData[0] ? (clvData[0] as any).total_orgs : 0
      },
      usage_trends: usageTrends.map((trend: any) => ({
        week: trend.week,
        avg_sms_per_week: Math.round(trend.avg_sms_per_week || 0),
        avg_emails_per_week: Math.round(trend.avg_emails_per_week || 0),
        active_organizations: trend.active_orgs
      })),
      support_correlation: {
        total_tickets: (supportCorrelation[0] as any)?.ticket_count || 0,
        churned_organizations: (supportCorrelation[0] as any)?.churned_orgs || 0,
        organizations_with_tickets: (supportCorrelation[0] as any)?.orgs_with_tickets || 0,
        churn_rate_with_tickets: (supportCorrelation[0] as any)?.orgs_with_tickets > 0 
          ? Math.round(((supportCorrelation[0] as any).churned_orgs / (supportCorrelation[0] as any).orgs_with_tickets) * 100)
          : 0
      },
      revenue_by_plan: revenueByPlan.map((revenue: any) => ({
        plan_name: revenue.plan_name,
        month: revenue.month,
        subscriptions: revenue.subscriptions,
        monthly_revenue_aud: Math.round(revenue.monthly_revenue_cents / 100)
      })),
      timeframe,
      generated_at: new Date().toISOString()
    };

    res.json(analytics);

  } catch (error) {
    console.error('[ADMIN] Error fetching analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/alerts
 * Get business alerts and thresholds
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = [];

    // Check MRR drop alert
    const mrrTrend = await db.execute(sql`
      SELECT 
        DATE_TRUNC('month', updated_at) as month,
        SUM(sp.price_monthly_cents) as mrr_cents
      FROM org_subscriptions os
      JOIN subscription_plans sp ON os.plan_id = sp.id
      WHERE os.status = 'active'
        AND updated_at >= NOW() - INTERVAL '2 months'
      GROUP BY month
      ORDER BY month DESC
      LIMIT 2
    `);

    if (mrrTrend.length === 2) {
      const currentMrr = (mrrTrend[0] as any).mrr_cents;
      const previousMrr = (mrrTrend[1] as any).mrr_cents;
      const mrrChange = ((currentMrr - previousMrr) / previousMrr) * 100;

      if (mrrChange < -10) { // 10% drop threshold
        alerts.push({
          type: 'mrr_drop',
          severity: 'critical',
          title: 'MRR Drop Alert',
          message: `Monthly Recurring Revenue dropped by ${Math.abs(Math.round(mrrChange))}% this month`,
          data: { 
            current_mrr: Math.round(currentMrr / 100),
            previous_mrr: Math.round(previousMrr / 100),
            change_percent: Math.round(mrrChange)
          }
        });
      }
    }

    // Check high churn rate alert
    const churnRate = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at >= NOW() - INTERVAL '7 days') as churned_week,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') as total_changes_week
      FROM org_subscriptions
    `);

    const churn = churnRate[0] as any;
    if (churn.total_changes_week > 0) {
      const weeklyChurnRate = (churn.churned_week / churn.total_changes_week) * 100;
      
      if (weeklyChurnRate > 20) { // 20% weekly churn threshold
        alerts.push({
          type: 'high_churn',
          severity: 'warning',
          title: 'High Churn Rate',
          message: `Weekly churn rate is ${Math.round(weeklyChurnRate)}%, above threshold`,
          data: {
            churn_rate: Math.round(weeklyChurnRate),
            churned_this_week: churn.churned_week,
            threshold: 20
          }
        });
      }
    }

    // Check support ticket spike
    const supportSpike = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as tickets_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as tickets_7d
      FROM support_tickets
    `);

    const support = supportSpike[0] as any;
    const avgDaily = support.tickets_7d / 7;
    
    if (support.tickets_24h > avgDaily * 2) { // 2x average threshold
      alerts.push({
        type: 'support_spike',
        severity: 'warning',
        title: 'Support Ticket Spike',
        message: `Support tickets increased to ${support.tickets_24h} in last 24h (avg: ${Math.round(avgDaily)})`,
        data: {
          tickets_24h: support.tickets_24h,
          avg_daily: Math.round(avgDaily),
          multiplier: Math.round(support.tickets_24h / avgDaily)
        }
      });
    }

    // Check failed payments
    const failedPayments = await db.execute(sql`
      SELECT COUNT(*) as failed_count
      FROM org_subscriptions
      WHERE status = 'past_due'
        AND updated_at >= NOW() - INTERVAL '24 hours'
    `);

    const failed = (failedPayments[0] as any).failed_count;
    if (failed > 0) {
      alerts.push({
        type: 'failed_payments',
        severity: 'critical',
        title: 'Failed Payments',
        message: `${failed} payment${failed > 1 ? 's' : ''} failed in the last 24 hours`,
        data: {
          failed_count: failed
        }
      });
    }

    res.json({
      alerts,
      total_alerts: alerts.length,
      critical_count: alerts.filter(a => a.severity === 'critical').length,
      warning_count: alerts.filter(a => a.severity === 'warning').length,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ADMIN] Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;