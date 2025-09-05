import { Request, Response, NextFunction } from 'express'
import { db } from '../db/client'
import { orgSubscriptions, subscriptionPlans } from '../../shared/schema'
import { eq } from 'drizzle-orm'

// Middleware to check subscription status
export async function checkSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.orgId
    if (!orgId) {
      return res.status(401).json({ error: 'Organization required' })
    }
    
    const [result] = await db
      .select({
        subscription: orgSubscriptions,
        plan: subscriptionPlans
      })
      .from(orgSubscriptions)
      .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
      .where(eq(orgSubscriptions.orgId, orgId))
    
    if (!result) {
      // No subscription found, create a 14-day Pro trial
      const [newSub] = await db
        .insert(orgSubscriptions)
        .values({
          orgId,
          planId: 'pro',
          status: 'trial',
          trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        })
        .returning()
      
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, 'pro'))
      
      req.subscription = {
        planId: 'pro',
        status: 'trial',
        isActive: true, // Trial is active
        features: plan?.features as any[] || []
      }
    } else {
      const isActive = result.subscription.status === 'active' || 
                      (result.subscription.status === 'trial' && 
                       result.subscription.trialEnd && 
                       new Date() < result.subscription.trialEnd)
      
      req.subscription = {
        planId: result.subscription.planId,
        status: result.subscription.status,
        isActive,
        features: result.plan?.features as any[] || []
      }
    }
    
    next()
  } catch (error) {
    console.error('Error checking subscription:', error)
    res.status(500).json({ error: 'Subscription check failed' })
  }
}

// Middleware to require active subscription (blocks access when trial expires)
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.subscription?.isActive) {
    const isExpiredTrial = req.subscription?.status === 'trial' && 
                          req.subscription?.trialEnd && 
                          new Date() >= new Date(req.subscription.trialEnd);
    
    return res.status(402).json({ 
      error: isExpiredTrial 
        ? 'Your 14-day trial has expired. Please upgrade to continue using Taska.'
        : 'Active subscription required',
      code: isExpiredTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_REQUIRED',
      subscription: req.subscription 
    })
  }
  next()
}

// Middleware to require specific plan or higher
export function requirePlan(minPlanLevel: 'solo' | 'pro' | 'enterprise') {
  const planLevels = { solo: 1, pro: 2, enterprise: 3 }
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.subscription?.isActive) {
      return res.status(402).json({ 
        error: 'Active subscription required',
        subscription: req.subscription 
      })
    }
    
    const currentLevel = planLevels[req.subscription.planId as keyof typeof planLevels] || 0
    const requiredLevel = planLevels[minPlanLevel]
    
    if (currentLevel < requiredLevel) {
      return res.status(402).json({ 
        error: `${minPlanLevel} plan or higher required`,
        currentPlan: req.subscription.planId,
        requiredPlan: minPlanLevel
      })
    }
    
    next()
  }
}