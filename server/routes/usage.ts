import { Router } from 'express'
import { db } from '../db/client'
import { subscriptionPlans, orgSubscriptions, usageCounters, users } from '../../shared/schema'
import { eq, and, sql, count } from 'drizzle-orm'
import { requireAuth, requireOrg } from '../middleware/auth'

const router = Router()

// Plan quota mapping system - defines limits for each subscription tier
export const PLAN_QUOTAS = {
  free: {
    users: 1,
    smsMonthly: 5,
    emailsMonthly: 10,
  },
  starter: {
    users: 3,
    smsMonthly: 50,
    emailsMonthly: 100,
  },
  pro: {
    users: 10,
    smsMonthly: 200,
    emailsMonthly: 500,
  },
  enterprise: {
    users: 50,
    smsMonthly: 1000,
    emailsMonthly: 2000,
  },
  // Legacy plan support
  solo: {
    users: 1,
    smsMonthly: 25,
    emailsMonthly: 50,
  },
} as const

// Helper to get normalized period boundaries [start inclusive, end exclusive)
function getCurrentPeriodBoundaries() {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1) // First day of current month
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)   // First day of next month
  return { periodStart, periodEnd, now }
}

// Helper to get plan quota with fallback to database values
async function getPlanQuotas(planId: string) {
  // First try static mapping
  const staticQuota = PLAN_QUOTAS[planId as keyof typeof PLAN_QUOTAS]
  if (staticQuota) {
    return staticQuota
  }

  // Fallback to database plan definition
  const [planResult] = await db
    .select({
      users: subscriptionPlans.usersQuota,
      smsMonthly: subscriptionPlans.smsQuotaMonthly,
      emailsMonthly: subscriptionPlans.emailsQuotaMonthly,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))

  if (planResult) {
    return {
      users: planResult.users || 1,
      smsMonthly: planResult.smsMonthly || 0,
      emailsMonthly: planResult.emailsMonthly || 0,
    }
  }

  // Ultimate fallback to free tier
  return PLAN_QUOTAS.free
}

// Helper to calculate usage percentage
function calculatePercent(used: number, quota: number): number {
  if (quota === 0) return 0
  return Math.round((used / quota) * 100)
}

// GET /api/usage - Returns current usage vs quotas for organization
router.get('/', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!
    const { periodStart, periodEnd } = getCurrentPeriodBoundaries()

    // Get organization's subscription and plan details
    const [subResult] = await db
      .select({
        planId: orgSubscriptions.planId,
        status: orgSubscriptions.status,
      })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.orgId, orgId))

    if (!subResult) {
      return res.status(404).json({ error: 'No subscription found for organization' })
    }

    const planId = subResult.planId || 'free'
    const quotas = await getPlanQuotas(planId)

    // Get current period usage from usage_counters
    const [usageResult] = await db
      .select({
        smsSent: usageCounters.smsSent,
        emailsSent: usageCounters.emailsSent,
      })
      .from(usageCounters)
      .where(and(
        eq(usageCounters.orgId, orgId),
        sql`${usageCounters.periodStart} <= ${periodStart}`,  // period_start <= periodStart
        sql`${periodStart} < ${usageCounters.periodEnd}`      // periodStart < period_end
      ))

    const currentUsage = {
      sms: usageResult?.smsSent || 0,
      emails: usageResult?.emailsSent || 0,
    }

    // Count active users in organization
    const [userCountResult] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.orgId, orgId))

    const activeUsers = userCountResult?.count || 0

    // Calculate SMS metrics
    const smsRemaining = Math.max(0, quotas.smsMonthly - currentUsage.sms)
    const smsPercent = calculatePercent(currentUsage.sms, quotas.smsMonthly)
    const smsQuotaExceeded = currentUsage.sms >= quotas.smsMonthly

    // Calculate email metrics
    const emailsRemaining = Math.max(0, quotas.emailsMonthly - currentUsage.emails)
    const emailsPercent = calculatePercent(currentUsage.emails, quotas.emailsMonthly)
    const emailsQuotaExceeded = currentUsage.emails >= quotas.emailsMonthly

    // Calculate user metrics
    const usersPercent = calculatePercent(activeUsers, quotas.users)

    // Format response according to specified structure
    const response = {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      planId: planId,
      subscriptionStatus: subResult.status,
      users: {
        used: activeUsers,
        quota: quotas.users,
        percent: usersPercent,
      },
      sms: {
        used: currentUsage.sms,
        quota: quotas.smsMonthly,
        remaining: smsRemaining,
        percent: smsPercent,
        quotaExceeded: smsQuotaExceeded,
      },
      email: {
        used: currentUsage.emails,
        quota: quotas.emailsMonthly,
        remaining: emailsRemaining,
        percent: emailsPercent,
        quotaExceeded: emailsQuotaExceeded,
      },
    }

    res.json(response)
  } catch (error) {
    console.error('Error fetching usage data:', error)
    res.status(500).json({ error: 'Failed to fetch usage data' })
  }
})

// GET /api/usage/quotas - Returns plan quotas only (useful for frontend plan comparison)
router.get('/quotas', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!

    // Get organization's current plan
    const [subResult] = await db
      .select({
        planId: orgSubscriptions.planId,
      })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.orgId, orgId))

    const planId = subResult?.planId || 'free'
    const quotas = await getPlanQuotas(planId)

    // Also include quotas for all available plans for comparison
    const allPlanQuotas = {
      current: {
        planId,
        ...quotas,
      },
      available: Object.entries(PLAN_QUOTAS).map(([id, quota]) => ({
        planId: id,
        ...quota,
      })),
    }

    res.json(allPlanQuotas)
  } catch (error) {
    console.error('Error fetching quota data:', error)
    res.status(500).json({ error: 'Failed to fetch quota data' })
  }
})

export default router