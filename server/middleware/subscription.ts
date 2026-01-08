import { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { orgSubscriptions, subscriptionPlans, users } from "../../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Detect portal requests so we can bypass subscription gating.
 * Priority:
 *  1) req.isPortal (set by requirePortalOrStaff)
 *  2) session markers (fallback)
 */
function isPortalRequest(req: any): boolean {
  if (req?.isPortal) return true;

  return Boolean(
    req?.session?.portalCustomerId ||
      req?.session?.customerId ||
      req?.session?.customer?.id
  );
}

// Middleware to check subscription status
export async function checkSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // ✅ Portal customers should NOT be subscription-gated
    if (isPortalRequest(req as any)) {
      // Optional: provide a benign subscription object in case downstream code expects it
      (req as any).subscription = {
        planId: "portal",
        status: "active",
        isActive: true,
        trialEnd: undefined,
        features: [],
      };
      return next();
    }

    const orgId = (req as any).orgId;
    if (!orgId) {
      return res.status(401).json({ error: "Organization required" });
    }

    // SECRET: Business owner bypass - Keith Richmond always gets enterprise access
    const userId = (req as any).user?.id;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const isBusinessOwner = user?.email === "keith.richmond@live.com";

      if (isBusinessOwner) {
        (req as any).subscription = {
          planId: "enterprise",
          status: "active",
          isActive: true,
          trialEnd: undefined,
          features: ["all_features", "unlimited_access", "enterprise_support"],
        };
        return next();
      }
    }

    // Everyone else gets normal subscription checking with aggressive paywall
    const [result] = await db
      .select({
        subscription: orgSubscriptions,
        plan: subscriptionPlans,
      })
      .from(orgSubscriptions)
      .leftJoin(
        subscriptionPlans,
        eq(orgSubscriptions.planId, subscriptionPlans.id)
      )
      .where(eq(orgSubscriptions.orgId, orgId));

    if (!result) {
      // No subscription found, create a 14-day Pro trial
      const [newSub] = await db
        .insert(orgSubscriptions)
        .values({
          orgId,
          planId: "pro",
          status: "trial",
          trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        })
        .returning();

      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, "pro"));

      (req as any).subscription = {
        planId: "pro",
        status: "trial",
        isActive: true, // Trial is active
        trialEnd: newSub.trialEnd || undefined,
        features: (plan?.features as any[]) || [],
      };
    } else {
      const isActive =
        result.subscription.status === "active" ||
        (result.subscription.status === "trial" &&
          result.subscription.trialEnd &&
          new Date() < result.subscription.trialEnd);

      (req as any).subscription = {
        planId: result.subscription.planId || "free",
        status: result.subscription.status || "inactive",
        isActive: !!isActive,
        trialEnd: result.subscription.trialEnd || undefined,
        features: (result.plan?.features as any[]) || [],
      };
    }

    next();
  } catch (error) {
    console.error("Error checking subscription:", error);
    res.status(500).json({ error: "Subscription check failed" });
  }
}

// Middleware to require active subscription (blocks access when trial expires)
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // ✅ Portal customers should NOT be subscription-gated
  if (isPortalRequest(req as any)) {
    return next();
  }

  // SECRET: Business owner bypass - Keith Richmond gets unlimited access
  const userId = (req as any).user?.id;
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const isBusinessOwner = user?.email === "keith.richmond@live.com";

    if (isBusinessOwner) {
      return next();
    }
  }

  // Aggressive paywall for everyone else
  if (!(req as any).subscription?.isActive) {
    const isExpiredTrial =
      (req as any).subscription?.status === "trial" &&
      (req as any).subscription?.trialEnd &&
      new Date() >= (req as any).subscription.trialEnd;

    return res.status(402).json({
      error: isExpiredTrial
        ? "🔒 Your 14-day trial has expired! Upgrade now to restore full access to Taska."
        : "💎 Premium Feature - Upgrade your subscription to unlock this functionality.",
      message: isExpiredTrial
        ? "Don't lose your momentum! Your trial ended, but all your data is safely stored. Upgrade to continue managing your field service operations."
        : "This feature requires an active subscription. Upgrade now to access all of Taska's powerful tools.",
      code: isExpiredTrial ? "TRIAL_EXPIRED" : "SUBSCRIPTION_REQUIRED",
      action: {
        label: "Upgrade Now",
        url: "/subscription",
      },
      subscription: (req as any).subscription,
    });
  }

  next();
}

// Middleware to require specific plan or higher
export function requirePlan(minPlanLevel: "solo" | "pro" | "enterprise") {
  const planLevels = { solo: 1, pro: 2, enterprise: 3 };

  return async (req: Request, res: Response, next: NextFunction) => {
    // ✅ Portal customers should NOT be subscription-gated
    if (isPortalRequest(req as any)) {
      return next();
    }

    // SECRET: Business owner bypass - Keith Richmond gets enterprise-level access
    const userId = (req as any).user?.id;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const isBusinessOwner = user?.email === "keith.richmond@live.com";

      if (isBusinessOwner) {
        console.log("[BYPASS] Business owner enterprise access granted");
        return next();
      }
    }

    // Aggressive plan restrictions for everyone else
    if (!(req as any).subscription?.isActive) {
      return res.status(402).json({
        error: "Active subscription required",
        subscription: (req as any).subscription,
      });
    }

    const currentLevel =
      planLevels[
        ((req as any).subscription.planId as keyof typeof planLevels) || "solo"
      ] || 0;
    const requiredLevel = planLevels[minPlanLevel];

    if (currentLevel < requiredLevel) {
      return res.status(402).json({
        error: `${minPlanLevel} plan or higher required`,
        currentPlan: (req as any).subscription.planId,
        requiredPlan: minPlanLevel,
      });
    }

    next();
  };
}
