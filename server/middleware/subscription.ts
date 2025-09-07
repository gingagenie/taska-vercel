import { Request, Response, NextFunction } from 'express'
import { db } from '../db/client'
import { orgSubscriptions, subscriptionPlans, users } from '../../shared/schema'
import { eq } from 'drizzle-orm'

// Middleware to check subscription status
export async function checkSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.orgId
    if (!orgId) {
      return res.status(401).json({ error: 'Organization required' })
    }
    
    // SECRET: Business owner bypass - Keith Richmond always gets enterprise access
    const userId = req.user?.id;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const isBusinessOwner = user?.email === 'keith.richmond@live.com';
      
      if (isBusinessOwner) {
        // Give business owner unlimited enterprise access
        req.subscription = {
          planId: 'enterprise',
          status: 'active',
          isActive: true,
          trialEnd: undefined,
          features: ['all_features', 'unlimited_access', 'enterprise_support']
        }
        console.log('[BYPASS] Business owner subscription set to enterprise');
        return next();
      }
    }
    
    // Everyone else gets normal subscription checking with aggressive paywall
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
        trialEnd: newSub.trialEnd || undefined,
        features: plan?.features as any[] || []
      }
    } else {
      const isActive = result.subscription.status === 'active' || 
                      (result.subscription.status === 'trial' && 
                       result.subscription.trialEnd && 
                       new Date() < result.subscription.trialEnd)
      
      req.subscription = {
        planId: result.subscription.planId || 'free',
        status: result.subscription.status || 'inactive',
        isActive: !!isActive,
        trialEnd: result.subscription.trialEnd || undefined,
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
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  // SECRET: Business owner bypass - Keith Richmond gets unlimited access
  const userId = req.user?.id;
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const isBusinessOwner = user?.email === 'keith.richmond@live.com';
    
    if (isBusinessOwner) {
      // Silent bypass for business owner - full access to everything
      console.log('[BYPASS] Business owner access granted');
      return next();
    }
  }
  
  // Aggressive paywall for everyone else
  if (!req.subscription?.isActive) {
    const isExpiredTrial = req.subscription?.status === 'trial' && 
                          req.subscription?.trialEnd && 
                          new Date() >= req.subscription.trialEnd;
    
    return res.status(402).json({ 
      error: isExpiredTrial 
        ? '🔒 Your 14-day trial has expired! Upgrade now to restore full access to Taska.'
        : '💎 Premium Feature - Upgrade your subscription to unlock this functionality.',
      message: isExpiredTrial 
        ? 'Don\'t lose your momentum! Your trial ended, but all your data is safely stored. Upgrade to continue managing your field service operations.'
        : 'This feature requires an active subscription. Upgrade now to access all of Taska\'s powerful tools.',
      code: isExpiredTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_REQUIRED',
      action: {
        label: 'Upgrade Now',
        url: '/subscription'
      },
      subscription: req.subscription 
    })
  }
  next()
}

// Middleware to require specific plan or higher
export function requirePlan(minPlanLevel: 'solo' | 'pro' | 'enterprise') {
  const planLevels = { solo: 1, pro: 2, enterprise: 3 }
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // SECRET: Business owner bypass - Keith Richmond gets enterprise-level access
    const userId = req.user?.id;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const isBusinessOwner = user?.email === 'keith.richmond@live.com';
      
      if (isBusinessOwner) {
        console.log('[BYPASS] Business owner enterprise access granted');
        return next();
      }
    }
    
    // Aggressive plan restrictions for everyone else
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