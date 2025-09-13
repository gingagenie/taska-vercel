import { Router } from 'express'
import express from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { db } from '../db/client'
import { subscriptionPlans, orgSubscriptions, usageCounters, users, usagePacks, organizations } from '../../shared/schema'
import { eq, and, sql, count, gte, lt, desc, asc } from 'drizzle-orm'
import { requireAuth, requireOrg } from '../middleware/auth'

const router = Router()

// Initialize Stripe client
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Using default API version to avoid TypeScript compatibility issues
})

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
    const { periodStart, periodEnd, now } = getCurrentPeriodBoundaries()

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

    // Get current period usage from usage_counters with proper period filtering
    // Convert dates to ISO strings to avoid PostgreSQL date object issues
    const nowString = now.toISOString()
    const [usageResult] = await db
      .select({
        smsSent: usageCounters.smsSent,
        emailsSent: usageCounters.emailsSent,
      })
      .from(usageCounters)
      .where(and(
        eq(usageCounters.orgId, orgId),
        sql`${usageCounters.periodStart} <= ${nowString}::timestamp`,  
        sql`${nowString}::timestamp < ${usageCounters.periodEnd}`      
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

    // Get available pack credits for SMS and Email
    const activePacks = await db
      .select({
        packType: usagePacks.packType,
        availableCredits: sql<number>`${usagePacks.quantity} - ${usagePacks.usedQuantity}`.as('availableCredits'),
      })
      .from(usagePacks)
      .where(and(
        eq(usagePacks.orgId, orgId),
        eq(usagePacks.status, 'active'),
        sql`${usagePacks.expiresAt} > NOW()`,
        sql`${usagePacks.quantity} > ${usagePacks.usedQuantity}`
      ))

    // Calculate total available pack credits by type
    const smsPackCredits = activePacks
      .filter(pack => pack.packType === 'sms')
      .reduce((total, pack) => total + pack.availableCredits, 0)
    
    const emailPackCredits = activePacks
      .filter(pack => pack.packType === 'email')
      .reduce((total, pack) => total + pack.availableCredits, 0)

    // Calculate SMS metrics with pack awareness
    const smsRemaining = Math.max(0, quotas.smsMonthly - currentUsage.sms)
    const smsPercent = calculatePercent(currentUsage.sms, quotas.smsMonthly)
    const smsQuotaExceeded = currentUsage.sms >= quotas.smsMonthly
    const totalSmsCredits = smsRemaining + smsPackCredits
    const allSmsExhausted = totalSmsCredits <= 0

    // Calculate email metrics with pack awareness
    const emailsRemaining = Math.max(0, quotas.emailsMonthly - currentUsage.emails)
    const emailsPercent = calculatePercent(currentUsage.emails, quotas.emailsMonthly)
    const emailsQuotaExceeded = currentUsage.emails >= quotas.emailsMonthly
    const totalEmailCredits = emailsRemaining + emailPackCredits
    const allEmailsExhausted = totalEmailCredits <= 0

    // Calculate user metrics
    const usersPercent = calculatePercent(activeUsers, quotas.users)

    // Format response according to specified structure with pack awareness
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
        // Pack-aware fields
        packCredits: smsPackCredits,
        totalAvailable: totalSmsCredits,
        allExhausted: allSmsExhausted,
      },
      email: {
        used: currentUsage.emails,
        quota: quotas.emailsMonthly,
        remaining: emailsRemaining,
        percent: emailsPercent,
        quotaExceeded: emailsQuotaExceeded,
        // Pack-aware fields
        packCredits: emailPackCredits,
        totalAvailable: totalEmailCredits,
        allExhausted: allEmailsExhausted,
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

// Pack pricing configuration
export const PACK_PRODUCTS = {
  sms_pack_100: { type: 'sms' as const, quantity: 100, priceUsd: 500 }, // $5.00 in cents
  sms_pack_500: { type: 'sms' as const, quantity: 500, priceUsd: 2000 }, // $20.00 in cents
  sms_pack_1000: { type: 'sms' as const, quantity: 1000, priceUsd: 3500 }, // $35.00 in cents
  email_pack_200: { type: 'email' as const, quantity: 200, priceUsd: 300 }, // $3.00 in cents
  email_pack_500: { type: 'email' as const, quantity: 500, priceUsd: 700 }, // $7.00 in cents
  email_pack_1000: { type: 'email' as const, quantity: 1000, priceUsd: 1200 }, // $12.00 in cents
} as const

// Validation schemas
const packCheckoutSchema = z.object({
  productId: z.string().refine(
    (id) => id in PACK_PRODUCTS,
    { message: 'Invalid product ID' }
  ),
})

const packConsumeSchema = z.object({
  packType: z.enum(['sms', 'email']),
  quantity: z.number().positive().int(),
})

// Helper function to get pack expiry date (6 months from purchase)
function getPackExpiryDate(purchaseDate: Date = new Date()): Date {
  const expiry = new Date(purchaseDate)
  expiry.setMonth(expiry.getMonth() + 6)
  return expiry
}

// Helper function to update pack status based on usage
async function updatePackStatus(packId: string) {
  const [pack] = await db
    .select()
    .from(usagePacks)
    .where(eq(usagePacks.id, packId))

  if (!pack) return

  const now = new Date()
  let newStatus = pack.status

  // Check if expired
  if (now >= pack.expiresAt && pack.status === 'active') {
    newStatus = 'expired'
  }
  // Check if used up
  else if (pack.usedQuantity >= pack.quantity && pack.status === 'active') {
    newStatus = 'used_up'
  }

  if (newStatus !== pack.status) {
    await db
      .update(usagePacks)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(usagePacks.id, packId))
  }
}

// GET /api/usage/packs/available - List available pack types and pricing
router.get('/packs/available', requireAuth, requireOrg, async (req, res) => {
  try {
    const availablePacks = Object.entries(PACK_PRODUCTS).map(([productId, pack]) => ({
      productId,
      type: pack.type,
      quantity: pack.quantity,
      priceUsd: pack.priceUsd,
      displayPrice: `$${(pack.priceUsd / 100).toFixed(2)}`,
      description: `${pack.quantity} ${pack.type.toUpperCase()} pack`,
    }))

    res.json({
      success: true,
      data: availablePacks,
    })
  } catch (error) {
    console.error('Error fetching available packs:', error)
    res.status(500).json({ error: 'Failed to fetch available packs' })
  }
})

// POST /api/usage/packs/checkout - Create Stripe checkout session for pack purchase
router.post('/packs/checkout', requireAuth, requireOrg, async (req, res) => {
  try {
    const validatedData = packCheckoutSchema.parse(req.body)
    const { productId } = validatedData
    const orgId = req.orgId!

    const packProduct = PACK_PRODUCTS[productId as keyof typeof PACK_PRODUCTS]

    // Get organization details
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' })
    }

    // Get or create Stripe customer
    let stripeCustomerId: string
    const [existingSub] = await db
      .select({ stripeCustomerId: orgSubscriptions.stripeCustomerId })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.orgId, orgId))

    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId
    } else {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { orgId },
      })
      stripeCustomerId = customer.id

      // Update subscription record with customer ID if exists
      if (existingSub) {
        await db
          .update(orgSubscriptions)
          .set({ stripeCustomerId })
          .where(eq(orgSubscriptions.orgId, orgId))
      }
    }

    // Create checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packProduct.quantity} ${packProduct.type.toUpperCase()} Pack`,
              description: `Add ${packProduct.quantity} ${packProduct.type} messages to your account`,
            },
            unit_amount: packProduct.priceUsd,
          },
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment, not subscription
      success_url: `${req.protocol}://${req.get('host')}/settings?tab=billing&pack_success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/settings?tab=billing&pack_canceled=true`,
      metadata: {
        orgId,
        productId,
        packType: packProduct.type,
        packQuantity: packProduct.quantity.toString(),
      },
    })

    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id 
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors
      })
    }
    console.error('Error creating pack checkout session:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// POST /api/usage/packs/webhook - Handle Stripe webhook for completed purchases
// Raw body parsing is handled at application level in server/index.ts
router.post('/packs/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (err: any) {
    console.error(`Pack webhook signature verification failed: ${err.message}`)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { orgId, productId, packType, packQuantity } = session.metadata!

        // Only process if this is a pack purchase (has packType metadata)
        if (!packType || !packQuantity) {
          break
        }

        // Check for existing pack with same payment ID to prevent duplicates
        const stripePaymentId = session.payment_intent as string || session.id
        const [existingPack] = await db
          .select()
          .from(usagePacks)
          .where(eq(usagePacks.stripePaymentId, stripePaymentId))

        if (existingPack) {
          console.log(`Pack already exists for payment ${stripePaymentId}, skipping duplicate creation`)
          break
        }

        // Create usage pack record
        const expiryDate = getPackExpiryDate()
        await db
          .insert(usagePacks)
          .values({
            orgId,
            packType: packType as 'sms' | 'email',
            quantity: parseInt(packQuantity),
            usedQuantity: 0,
            purchasedAt: new Date(),
            expiresAt: expiryDate,
            stripePaymentId,
            status: 'active',
          })

        console.log(`Pack purchased: ${packType} pack of ${packQuantity} for org ${orgId}`)
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log(`Pack payment succeeded: ${paymentIntent.id}`)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log(`Pack payment failed: ${paymentIntent.id}`)
        break
      }
    }

    res.json({ received: true })
  } catch (error) {
    console.error('Error processing pack webhook:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /api/usage/packs - List organization's purchased packs
router.get('/packs', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!
    const { status } = req.query

    // Build where conditions based on filters
    let whereConditions = eq(usagePacks.orgId, orgId)

    // Filter by status if provided
    if (status && typeof status === 'string') {
      if (!['active', 'expired', 'used_up'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' })
      }
      whereConditions = and(
        eq(usagePacks.orgId, orgId),
        eq(usagePacks.status, status as 'active' | 'expired' | 'used_up')
      )!
    }

    const packs = await db
      .select()
      .from(usagePacks)
      .where(whereConditions)
      .orderBy(desc(usagePacks.purchasedAt))

    // Update pack statuses before returning
    for (const pack of packs) {
      await updatePackStatus(pack.id)
    }

    // Fetch updated packs with same filter conditions
    const updatedPacks = await db
      .select()
      .from(usagePacks)
      .where(whereConditions)
      .orderBy(desc(usagePacks.purchasedAt))

    const formattedPacks = updatedPacks.map(pack => ({
      id: pack.id,
      packType: pack.packType,
      quantity: pack.quantity,
      usedQuantity: pack.usedQuantity,
      remainingQuantity: pack.quantity - pack.usedQuantity,
      purchasedAt: pack.purchasedAt,
      expiresAt: pack.expiresAt,
      status: pack.status,
      usagePercent: Math.round((pack.usedQuantity / pack.quantity) * 100),
    }))

    res.json({
      success: true,
      data: formattedPacks,
    })
  } catch (error) {
    console.error('Error fetching usage packs:', error)
    res.status(500).json({ error: 'Failed to fetch usage packs' })
  }
})

// GET /api/usage/packs/active - Get only active packs with remaining quantity
router.get('/packs/active', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!
    const { packType } = req.query

    let whereConditions = and(
      eq(usagePacks.orgId, orgId),
      eq(usagePacks.status, 'active'),
      sql`${usagePacks.usedQuantity} < ${usagePacks.quantity}`,
      sql`${usagePacks.expiresAt} > NOW()`
    )

    // Filter by pack type if provided
    if (packType && typeof packType === 'string') {
      if (!['sms', 'email'].includes(packType)) {
        return res.status(400).json({ error: 'Invalid pack type filter' })
      }
      whereConditions = and(
        whereConditions,
        eq(usagePacks.packType, packType as 'sms' | 'email')
      )
    }

    const activePacks = await db
      .select()
      .from(usagePacks)
      .where(whereConditions)
      .orderBy(asc(usagePacks.purchasedAt)) // FIFO order for consumption

    const formattedPacks = activePacks.map(pack => ({
      id: pack.id,
      packType: pack.packType,
      quantity: pack.quantity,
      usedQuantity: pack.usedQuantity,
      remainingQuantity: pack.quantity - pack.usedQuantity,
      purchasedAt: pack.purchasedAt,
      expiresAt: pack.expiresAt,
      status: pack.status,
    }))

    res.json({
      success: true,
      data: formattedPacks,
    })
  } catch (error) {
    console.error('Error fetching active packs:', error)
    res.status(500).json({ error: 'Failed to fetch active packs' })
  }
})

// POST /api/usage/packs/consume - Internal endpoint to consume pack quantity
router.post('/packs/consume', requireAuth, requireOrg, async (req, res) => {
  try {
    const validatedData = packConsumeSchema.parse(req.body)
    const { packType, quantity } = validatedData
    const orgId = req.orgId!

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be positive' })
    }

    // Get active packs for this type, ordered by purchase date (FIFO)
    const activePacks = await db
      .select()
      .from(usagePacks)
      .where(and(
        eq(usagePacks.orgId, orgId),
        eq(usagePacks.packType, packType),
        eq(usagePacks.status, 'active'),
        sql`${usagePacks.usedQuantity} < ${usagePacks.quantity}`,
        sql`${usagePacks.expiresAt} > NOW()`
      ))
      .orderBy(asc(usagePacks.purchasedAt))

    let remainingToConsume = quantity
    const consumedPacks: Array<{ id: string; consumed: number }> = []

    // Consume from packs in FIFO order
    for (const pack of activePacks) {
      if (remainingToConsume <= 0) break

      const availableInPack = pack.quantity - pack.usedQuantity
      const toConsumeFromPack = Math.min(remainingToConsume, availableInPack)

      if (toConsumeFromPack > 0) {
        const newUsedQuantity = pack.usedQuantity + toConsumeFromPack

        await db
          .update(usagePacks)
          .set({
            usedQuantity: newUsedQuantity,
            updatedAt: new Date(),
          })
          .where(eq(usagePacks.id, pack.id))

        consumedPacks.push({ id: pack.id, consumed: toConsumeFromPack })
        remainingToConsume -= toConsumeFromPack

        // Update pack status if fully consumed
        await updatePackStatus(pack.id)
      }
    }

    if (remainingToConsume > 0) {
      return res.status(402).json({ 
        error: 'Insufficient pack credit',
        shortfall: remainingToConsume,
        consumed: quantity - remainingToConsume,
      })
    }

    res.json({
      success: true,
      consumed: quantity,
      fromPacks: consumedPacks,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors
      })
    }
    console.error('Error consuming pack quantity:', error)
    res.status(500).json({ error: 'Failed to consume pack quantity' })
  }
})

export default router