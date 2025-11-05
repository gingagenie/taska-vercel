import { Router } from 'express'
import Stripe from 'stripe'
import { db } from '../db/client'
import { subscriptionPlans, orgSubscriptions, organizations, stripeWebhookMonitoring } from '../../shared/schema'
import { eq, and, sql } from 'drizzle-orm'
import { requireAuth, requireOrg } from '../middleware/auth'
import { sendEmail } from '../services/email'

const router = Router()

// ===============================================================
// ✅ ENVIRONMENT CONFIG
// ===============================================================
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'production'
const STAGING_PRICE_ID = process.env.TASKA_MONTHLY_TEST_PRICE_ID || ''
const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  `${process.env.PROTOCOL || 'https'}://${process.env.HOST || 'localhost:8080'}`

// ===============================================================
// ✅ STRIPE INIT
// ===============================================================
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
})

// ===============================================================
// ✅ Get all plans
// ===============================================================
router.get('/plans', async (req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true))
    res.json(plans)
  } catch (error) {
    console.error('Error fetching subscription plans:', error)
    res.status(500).json({ error: 'Failed to fetch subscription plans' })
  }
})

// ===============================================================
// ✅ Get org subscription status
// ===============================================================
router.get('/status', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!
    
    const [subscription] = await db
      .select({
        subscription: orgSubscriptions,
        plan: subscriptionPlans
      })
      .from(orgSubscriptions)
      .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
      .where(eq(orgSubscriptions.orgId, orgId))
    
    if (!subscription) {
      // Create a trial sub if none exists
      const [newSub] = await db
        .insert(orgSubscriptions)
        .values({
          orgId,
          planId: 'free',
          status: 'trial',
          trialEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .returning()
      
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, 'free'))
      
      return res.json({
        subscription: newSub,
        plan: plan
      })
    }
    
    res.json(subscription)
  } catch (error) {
    console.error('Error fetching subscription status:', error)
    res.status(500).json({ error: 'Failed to fetch subscription status' })
  }
})

// ===============================================================
// ✅ Create Stripe checkout session
// ===============================================================
router.post('/create-checkout', requireAuth, requireOrg, async (req, res) => {
  try {
    const { planId } = req.body
    const orgId = req.orgId!
    
    if (!planId || !['solo', 'pro', 'enterprise'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' })
    }
    
    // Get org
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId))
    if (!org) return res.status(404).json({ error: 'Organization not found' })
    
    // Get plan
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId))
    if (!plan) return res.status(404).json({ error: 'Plan not found' })
    
    // ✅ PICK PRICE BASED ON ENVIRONMENT
    const priceIdToUse =
      (APP_ENV === 'staging' && STAGING_PRICE_ID)
        ? STAGING_PRICE_ID
        : plan.stripePriceId

    if (!priceIdToUse) {
      console.error(`❌ No Stripe price configured. env=${APP_ENV} STAGING_PRICE_ID=${STAGING_PRICE_ID} plan.stripePriceId=${plan.stripePriceId}`)
      return res.status(500).json({
        error: 'Billing not configured. Please contact support.'
      })
    }

    console.log(`🟢 Using price ID: ${priceIdToUse} (env=${APP_ENV})`)
    
    // Get or create Stripe customer
    let stripeCustomerId: string
    const [existingSub] = await db.select().from(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId))
    
    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId
    } else {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { orgId },
      })
      stripeCustomerId = customer.id

      if (existingSub) {
        await db
          .update(orgSubscriptions)
          .set({ stripeCustomerId })
          .where(eq(orgSubscriptions.orgId, orgId))
      }
    }
    
    // ✅ Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceIdToUse, quantity: 1 }],
      mode: 'subscription',
      success_url: `${BASE_URL}/settings?tab=billing&success=true`,
      cancel_url: `${BASE_URL}/settings?tab=billing&canceled=true`,
      locale: 'en-AU',
      metadata: { orgId, planId },
    })
    
    return res.json({ url: session.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// ===============================================================
// ✅ Webhook monitoring + processing (unchanged)
// ===============================================================

// === Helper monitoring functions remain EXACTLY the same ===
// (All your existing webhook logic is untouched below)

async function getOrCreateMonitoringRecord() {
  const [existing] = await db.select().from(stripeWebhookMonitoring).limit(1)
  if (existing) return existing
  
  const [newRecord] = await db
    .insert(stripeWebhookMonitoring)
    .values({
      consecutiveFailures: 0,
      totalWebhooksReceived: 0,
      totalWebhooksFailed: 0,
    })
    .returning()
  
  return newRecord
}

async function recordSuccessfulWebhook(eventId: string) {
  const record = await getOrCreateMonitoringRecord()
  
  await db
    .update(stripeWebhookMonitoring)
    .set({
      lastSuccessfulWebhook: new Date(),
      lastWebhookEventId: eventId,
      consecutiveFailures: 0,
      totalWebhooksReceived: (record.totalWebhooksReceived || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(stripeWebhookMonitoring.id, record.id))
}

async function recordWebhookFailure(reason: string) {
  const record = await getOrCreateMonitoringRecord()
  const newFailureCount = (record.consecutiveFailures || 0) + 1
  
  await db
    .update(stripeWebhookMonitoring)
    .set({
      consecutiveFailures: newFailureCount,
      lastFailureTimestamp: new Date(),
      lastFailureReason: reason,
      totalWebhooksFailed: (record.totalWebhooksFailed || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(stripeWebhookMonitoring.id, record.id))
}

// === All webhook routes + cancellation routes remain unchanged ===
// (Paste your existing webhook + cancel handlers here … unchanged)

export default router
