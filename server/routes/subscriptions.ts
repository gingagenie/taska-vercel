import { Router } from 'express'
import Stripe from 'stripe'
import { db } from '../db/client'
import { subscriptionPlans, orgSubscriptions, organizations } from '../../shared/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth, requireOrg } from '../middleware/auth'

const router = Router()

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
})

// Get all subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true))
    res.json(plans)
  } catch (error) {
    console.error('Error fetching subscription plans:', error)
    res.status(500).json({ error: 'Failed to fetch subscription plans' })
  }
})

// Get current org subscription status
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

// Create Stripe checkout session for subscription
router.post('/create-checkout', requireAuth, requireOrg, async (req, res) => {
  try {
    const { planId } = req.body
    const orgId = req.orgId!
    
    if (!planId || !['solo', 'pro', 'enterprise'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' })
    }
    
    // Get organization details
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId))
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' })
    }
    
    // Get plan details
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId))
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' })
    }
    
    // Get or create Stripe customer
    let stripeCustomerId: string
    const [existingSub] = await db.select().from(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId))
    
    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId
    } else {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: {
          orgId: orgId,
        },
      })
      stripeCustomerId = customer.id
      
      // Update subscription record with customer ID
      if (existingSub) {
        await db
          .update(orgSubscriptions)
          .set({ stripeCustomerId })
          .where(eq(orgSubscriptions.orgId, orgId))
      }
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: plan.name,
              description: `${plan.name} subscription for ${org.name}`,
            },
            unit_amount: plan.priceMonthly,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.protocol}://${req.get('host')}/settings?tab=billing&success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/settings?tab=billing&canceled=true`,
      metadata: {
        orgId: orgId,
        planId: planId,
      },
    })
    
    res.json({ url: session.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// Test webhook configuration
router.get('/webhook/test', (req, res) => {
  const hasSecret = !!process.env.STRIPE_WEBHOOK_SECRET
  const secretLength = process.env.STRIPE_WEBHOOK_SECRET?.length || 0
  const secretPrefix = process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10) || 'not set'
  
  res.json({
    configured: hasSecret,
    secretLength: secretLength,
    secretPrefix: secretPrefix,
    status: hasSecret ? '✅ Webhook secret is configured and accessible' : '❌ Webhook secret is NOT configured'
  })
})

// Track webhook failures for monitoring
let webhookFailureCount = 0
let lastWebhookFailure: Date | null = null

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event
  
  console.log('[WEBHOOK] ================================================')
  console.log('[WEBHOOK] Received webhook request at:', new Date().toISOString())
  console.log('[WEBHOOK] Has secret:', !!process.env.STRIPE_WEBHOOK_SECRET)
  console.log('[WEBHOOK] Has signature:', !!sig)
  
  // Verify webhook secret is configured
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[WEBHOOK] ❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not configured!')
    console.error('[WEBHOOK] ❌ This means the webhook secret is not linked to this Replit app')
    console.error('[WEBHOOK] ❌ Please check Replit secrets and ensure STRIPE_WEBHOOK_SECRET is linked')
    webhookFailureCount++
    lastWebhookFailure = new Date()
    return res.status(500).send('Webhook secret not configured')
  }
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    console.log('[WEBHOOK] ✅ Signature verified successfully!')
    console.log('[WEBHOOK] Event type:', event.type)
    console.log('[WEBHOOK] Event ID:', event.id)
  } catch (err: any) {
    console.error('[WEBHOOK] ================================================')
    console.error(`[WEBHOOK] ❌ SIGNATURE VERIFICATION FAILED`)
    console.error(`[WEBHOOK] Error: ${err.message}`)
    console.error(`[WEBHOOK] This usually means:`)
    console.error(`[WEBHOOK]   1. STRIPE_WEBHOOK_SECRET is wrong/outdated`)
    console.error(`[WEBHOOK]   2. Webhook URL in Stripe doesn't match this endpoint`)
    console.error(`[WEBHOOK]   3. Secret not linked to this Replit app`)
    console.error('[WEBHOOK] ================================================')
    webhookFailureCount++
    lastWebhookFailure = new Date()
    if (webhookFailureCount > 5) {
      console.error(`[WEBHOOK] ⚠️ WARNING: ${webhookFailureCount} consecutive webhook failures detected!`)
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
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
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
    
    // Webhook processed successfully - reset failure counter
    if (webhookFailureCount > 0) {
      console.log(`[WEBHOOK] ✅ Webhook processed successfully after ${webhookFailureCount} previous failures`)
      webhookFailureCount = 0
      lastWebhookFailure = null
    } else {
      console.log('[WEBHOOK] ✅ Webhook processed successfully')
    }
    console.log('[WEBHOOK] ================================================')
    
    res.json({ received: true })
  } catch (error) {
    console.error('[WEBHOOK] ================================================')
    console.error('[WEBHOOK] ❌ ERROR PROCESSING WEBHOOK:', error)
    console.error('[WEBHOOK] Event type:', event?.type)
    console.error('[WEBHOOK] Event ID:', event?.id)
    console.error('[WEBHOOK] ================================================')
    webhookFailureCount++
    lastWebhookFailure = new Date()
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Cancel subscription
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