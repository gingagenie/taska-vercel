import { Router } from 'express'
import Stripe from 'stripe'
import { db } from '../db/client'
import { subscriptionPlans, orgSubscriptions, organizations, stripeWebhookMonitoring } from '../../shared/schema'
import { eq, and, sql } from 'drizzle-orm'
import { requireAuth, requireOrg } from '../middleware/auth'
import { sendEmail } from '../services/email'

const router = Router()

// ===============================================================
// ✅ ENV / APP CONFIG
// ===============================================================
const APP_ENV = (process.env.APP_ENV || process.env.NODE_ENV || 'production').trim()
const STAGING_PRICE_ID = (process.env.TASKA_MONTHLY_TEST_PRICE_ID || '').trim()
const BASE_URL =
  (process.env.NEXT_PUBLIC_APP_URL || '').trim() ||
  `${process.env.PROTOCOL || 'https'}://${process.env.HOST || 'localhost:8080'}`

// Configuration for webhook failure alerts
const WEBHOOK_FAILURE_ALERT_THRESHOLD = 5
const WEBHOOK_ALERT_EMAIL = 'keith.richmond@live.com'

// ===============================================================
// ✅ STRIPE INIT (trim key + stable API version)
// ===============================================================
const RAW_STRIPE_KEY = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_KEY = RAW_STRIPE_KEY.trim()
if (!STRIPE_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY')
}
const stripe = new Stripe(STRIPE_KEY, {
  apiVersion: '2023-10-16',
})

// ===============================================================
// ✅ Get all subscription plans
// ===============================================================
router.get('/plans', async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true))
    res.json(plans)
  } catch (error) {
    console.error('Error fetching subscription plans:', error)
    res.status(500).json({ error: 'Failed to fetch subscription plans' })
  }
})

// ===============================================================
// ✅ Get current org subscription status
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
      // Create a default trial subscription
      const [newSub] = await db
        .insert(orgSubscriptions)
        .values({
          orgId,
          planId: 'free',
          status: 'trial',
          trialEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
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
// ✅ Create Stripe checkout session for subscription
//    - Staging uses TEST price from env
//    - Production uses live AUD price from DB
// ===============================================================
router.post('/create-checkout', requireAuth, requireOrg, async (req, res) => {
  try {
    const { planId } = req.body
    const orgId = req.orgId!

    if (!planId || !['solo', 'pro', 'enterprise'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' })
    }

    // Get organization details
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId))
    if (!org) return res.status(404).json({ error: 'Organization not found' })

    // Get plan details
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId))
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    // Pick the correct Stripe Price ID
    const priceIdToUse = (APP_ENV === 'staging' && STAGING_PRICE_ID) ? STAGING_PRICE_ID : (plan.stripePriceId || '').trim()
    if (!priceIdToUse) {
      console.error(`❌ No Stripe price configured. env=${APP_ENV} planPrice=${plan.stripePriceId} stagingPrice=${STAGING_PRICE_ID}`)
      return res.status(500).json({ error: 'Billing not configured. Please contact support.' })
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

    // Create checkout session (currency comes from the Price itself)
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
  } catch (error: any) {
    console.error('Error creating checkout session:', error?.stack || error)
    if (APP_ENV === 'staging') {
      return res.status(500).json({ error: 'create-checkout failed', details: String(error?.message || error) })
    }
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// ===============================================================
// ✅ Webhook monitoring helpers
// ===============================================================
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

  if (newFailureCount === WEBHOOK_FAILURE_ALERT_THRESHOLD) {
    void sendWebhookFailureAlert(newFailureCount, reason)
  }
}

async function sendWebhookFailureAlert(failureCount: number, lastReason: string) {
  try {
    console.log(`[WEBHOOK ALERT] Sending alert email - ${failureCount} consecutive failures`)

    const subject = `🚨 Stripe Webhook Alert: ${failureCount} Consecutive Failures`
    const html = `
      <h2>Stripe Webhook Failure Alert</h2>
      <p>The Taska subscription system has detected <strong>${failureCount} consecutive webhook failures</strong>.</p>
      <h3>Details:</h3>
      <ul>
        <li><strong>Consecutive Failures:</strong> ${failureCount}</li>
        <li><strong>Last Failure Reason:</strong> ${lastReason}</li>
        <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
      </ul>
      <h3>Recommended Actions:</h3>
      <ol>
        <li>Check the health endpoint: <a href="https://www.taska.info/api/subscriptions/health">https://www.taska.info/api/subscriptions/health</a></li>
        <li>Verify webhook endpoint URL in Stripe dashboard: <a href="https://dashboard.stripe.com/webhooks">https://dashboard.stripe.com/webhooks</a></li>
        <li>Ensure webhook URL matches production domain (www.taska.info)</li>
        <li>Verify STRIPE_WEBHOOK_SECRET is linked to the Replit app</li>
        <li>Check server logs for detailed error messages</li>
      </ol>
      <p><strong>This alert is sent when the failure threshold is reached to prevent silent subscription system failures.</strong></p>
    `
    const text = `Stripe Webhook Failure Alert\n\nThe Taska subscription system has detected ${failureCount} consecutive webhook failures.\n\nDetails:\n- Consecutive Failures: ${failureCount}\n- Last Failure Reason: ${lastReason}\n- Timestamp: ${new Date().toISOString()}\n\nRecommended Actions:\n1. Check the health endpoint: https://www.taska.info/api/subscriptions/health\n2. Verify webhook endpoint URL in Stripe dashboard: https://dashboard.stripe.com/webhooks\n3. Ensure webhook URL matches production domain (www.taska.info)\n4. Verify STRIPE_WEBHOOK_SECRET is linked to the Replit app\n5. Check server logs for detailed error messages\n\nThis alert is sent when the failure threshold is reached to prevent silent subscription system failures.`

    const emailSent = await sendEmail({
      to: WEBHOOK_ALERT_EMAIL,
      from: 'noreply@taska.info',
      subject,
      html,
      text
    })

    if (emailSent) console.log('[WEBHOOK ALERT] ✅ Alert email sent successfully')
    else console.error('[WEBHOOK ALERT] ❌ Failed to send alert email')
  } catch (error) {
    console.error('[WEBHOOK ALERT] ❌ Error sending alert email:', error)
  }
}

// ===============================================================
// ✅ Health endpoints
// ===============================================================
router.get('/health', async (_req, res) => {
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET
  const hasDatabaseUrl = !!process.env.DATABASE_URL

  const monitoringRecord = await getOrCreateMonitoringRecord()

  const [activeSubCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.status, 'active'))
  const hasActiveSubscriptions = (activeSubCount?.count || 0) > 0

  const now = new Date()
  const lastSuccessTime = monitoringRecord.lastSuccessfulWebhook
  const daysSinceLastWebhook = lastSuccessTime
    ? Math.floor((now.getTime() - lastSuccessTime.getTime()) / (1000 * 60 * 60 * 24))
    : null

  const webhooksAreStale = hasActiveSubscriptions && (
    !lastSuccessTime ||
    (daysSinceLastWebhook as number) > 35
  )

  const webhookHealth = {
    secretConfigured: hasWebhookSecret,
    failureCount: monitoringRecord.consecutiveFailures || 0,
    lastSuccess: monitoringRecord.lastSuccessfulWebhook ? monitoringRecord.lastSuccessfulWebhook.toISOString() : null,
    lastFailure: monitoringRecord.lastFailureTimestamp ? monitoringRecord.lastFailureTimestamp.toISOString() : null,
    daysSinceLastWebhook,
    totalReceived: monitoringRecord.totalWebhooksReceived || 0,
    totalFailed: monitoringRecord.totalWebhooksFailed || 0,
    hasActiveSubscriptions,
    isStale: webhooksAreStale,
    status: hasWebhookSecret ?
      (webhooksAreStale ? '⚠️ Stale - no recent webhooks detected' :
        (monitoringRecord.consecutiveFailures === 0 ? '✅ Healthy' :
          `⚠️ ${monitoringRecord.consecutiveFailures} consecutive failures`)) :
      '❌ Not configured'
  }

  const overallStatus = hasStripeKey && hasWebhookSecret && hasDatabaseUrl &&
    (monitoringRecord.consecutiveFailures || 0) === 0 &&
    !webhooksAreStale

  res.json({
    status: overallStatus ? '✅ All systems operational' : '⚠️ Configuration issues detected',
    timestamp: new Date().toISOString(),
    components: {
      stripe: {
        configured: hasStripeKey,
        status: hasStripeKey ? '✅ Configured' : '❌ STRIPE_SECRET_KEY not configured'
      },
      webhook: webhookHealth,
      database: {
        configured: hasDatabaseUrl,
        status: hasDatabaseUrl ? '✅ Configured' : '❌ DATABASE_URL not configured'
      }
    },
    actions: !overallStatus ? [
      !hasStripeKey && 'Add STRIPE_SECRET_KEY to secrets',
      !hasWebhookSecret && 'Link STRIPE_WEBHOOK_SECRET to this app',
      !hasDatabaseUrl && 'Configure DATABASE_URL',
      (monitoringRecord.consecutiveFailures || 0) > 0 && 'Check Stripe webhook URL matches production domain',
      webhooksAreStale && hasActiveSubscriptions && 'Verify webhook endpoint URL in Stripe dashboard - webhooks may not be reaching your app'
    ].filter(Boolean) : []
  })
})

router.get('/webhook/test', async (_req, res) => {
  const hasSecret = !!process.env.STRIPE_WEBHOOK_SECRET
  const secretLength = process.env.STRIPE_WEBHOOK_SECRET?.length || 0
  const secretPrefix = process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10) || 'not set'

  const monitoringRecord = await getOrCreateMonitoringRecord()

  res.json({
    configured: hasSecret,
    secretLength,
    secretPrefix,
    failureCount: monitoringRecord.consecutiveFailures || 0,
    lastFailure: monitoringRecord.lastFailureTimestamp ? monitoringRecord.lastFailureTimestamp.toISOString() : null,
    status: hasSecret ? '✅ Webhook secret is configured and accessible' : '❌ Webhook secret is NOT configured'
  })
})

// ===============================================================
// ✅ Stripe webhook handler
// ===============================================================
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event

  console.log('[WEBHOOK] ================================================')
  console.log('[WEBHOOK] Received webhook request at:', new Date().toISOString())
  console.log('[WEBHOOK] Has secret:', !!process.env.STRIPE_WEBHOOK_SECRET)
  console.log('[WEBHOOK] Has signature:', !!sig)

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[WEBHOOK] ❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not configured!')
    await recordWebhookFailure('STRIPE_WEBHOOK_SECRET not configured')
    return res.status(500).send('Webhook secret not configured')
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    console.log('[WEBHOOK] ✅ Signature verified successfully!')
    console.log('[WEBHOOK] Event type:', event.type)
    console.log('[WEBHOOK] Event ID:', event.id)
  } catch (err: any) {
    console.error('[WEBHOOK] ❌ SIGNATURE VERIFICATION FAILED', err?.message)
    await recordWebhookFailure(`Signature verification failed: ${err.message}`)
    const monitoringRecord = await getOrCreateMonitoringRecord()
    if ((monitoringRecord.consecutiveFailures || 0) > 5) {
      console.error(`[WEBHOOK] ⚠️ WARNING: ${monitoringRecord.consecutiveFailures} consecutive webhook failures detected!`)
    }
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    console.log('[WEBHOOK] Processing event:', event.type)
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { orgId, planId } = session.metadata!

        if (session.subscription) {
          await db
            .update(orgSubscriptions)
            .set({
              planId,
              stripeSubscriptionId: session.subscription as string,
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            })
            .where(eq(orgSubscriptions.orgId, orgId))
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscription = (invoice as any).subscription
        if (subscription) {
          const subscriptionId = typeof subscription === 'string' ? subscription : subscription.id
          await db
            .update(orgSubscriptions)
            .set({
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(orgSubscriptions.stripeSubscriptionId, subscriptionId))
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscription = (invoice as any).subscription
        if (subscription) {
          const subscriptionId = typeof subscription === 'string' ? subscription : subscription.id
          await db
            .update(orgSubscriptions)
            .set({
              status: 'past_due',
              updatedAt: new Date(),
            })
            .where(eq(orgSubscriptions.stripeSubscriptionId, subscriptionId))
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await db
          .update(orgSubscriptions)
          .set({
            status: 'canceled',
            updatedAt: new Date(),
          })
          .where(eq(orgSubscriptions.stripeSubscriptionId, subscription.id))
        break
      }
    }

    const monitoringRecord = await getOrCreateMonitoringRecord()
    if ((monitoringRecord.consecutiveFailures || 0) > 0) {
      console.log(`[WEBHOOK] ✅ Webhook processed successfully after ${monitoringRecord.consecutiveFailures} previous failures`)
    } else {
      console.log('[WEBHOOK] ✅ Webhook processed successfully')
    }

    await recordSuccessfulWebhook(event.id)
    console.log('[WEBHOOK] ================================================')

    res.json({ received: true })
  } catch (error) {
    console.error('[WEBHOOK] ❌ ERROR PROCESSING WEBHOOK:', error)
    await recordWebhookFailure(`Processing error: ${error}`)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ===============================================================
// ✅ Cancel subscription
// ===============================================================
router.post('/cancel', requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!

    const [subscription] = await db.select().from(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId))
    if (!subscription?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' })
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    await db
      .update(orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(orgSubscriptions.orgId, orgId))

    res.json({ success: true })
  } catch (error) {
    console.error('Error canceling subscription:', error)
    res.status(500).json({ error: 'Failed to cancel subscription' })
  }
})

export default router
