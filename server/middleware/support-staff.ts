import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role?: string };
      orgId?: string;
      isSupportStaff?: boolean;
      supportStaffOrgId?: string; // Original org ID for support staff
    }
  }
}

/**
 * Middleware to detect support staff and enable cross-org access to tickets only.
 * Support staff can access ticket data from all customer organizations,
 * but remain restricted to their own org for other data types.
 */
export async function detectSupportStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return next(); // Not authenticated, let other middleware handle
    }

    // Fetch user role from database
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id, email, name
      FROM users 
      WHERE id = ${userId}::uuid
    `);
    
    const user = userResult[0];
    if (!user) {
      return next(); // User not found, let other middleware handle
    }

    // Store user info on request for easy access
    req.user = {
      id: user.id,
      role: user.role
    };

    // Check if user is support staff
    const isSupportStaff = user.role === 'support_staff';
    req.isSupportStaff = isSupportStaff;

    if (isSupportStaff) {
      // Store the support staff's original org ID for reference
      req.supportStaffOrgId = user.org_id;
      console.log(`[SUPPORT_STAFF] Detected support staff: ${user.email} (${user.id})`);
    }

    next();
  } catch (error) {
    console.error("[SUPPORT_STAFF] Error detecting support staff:", error);
    // Don't fail the request, just continue without support staff privileges
    next();
  }
}

/**
 * Middleware for support staff to access ticket routes with cross-org permissions.
 * This middleware should be used instead of requireOrg for ticket-related routes.
 */
export async function requireTicketAccess(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // If user is support staff, they can access tickets from any org
  if (req.isSupportStaff) {
    console.log(`[SUPPORT_STAFF] Granting cross-org ticket access to ${req.user?.id}`);
    // Don't set orgId - this allows support staff to query across all orgs
    return next();
  }

  // For regular users, enforce normal org isolation
  const isProd = process.env.NODE_ENV === "production";
  const sessOrg = (req.session as any)?.orgId as string | undefined;
  const headerOrg = (req.headers["x-org-id"] as string | undefined) || undefined;

  // 🚫 In production, ignore header org completely for non-support staff
  let chosen = isProd ? sessOrg : (sessOrg || headerOrg);

  // Fallback from user row if we have a session user
  if (!chosen) {
    const r: any = await db.execute(sql`
      SELECT org_id FROM users WHERE id = ${userId}::uuid
    `);
    chosen = r[0]?.org_id;
  }

  if (!chosen) {
    console.log(`[TICKET_ACCESS] 401 - No org found for regular user: userId=${userId}`);
    return res.status(401).json({ error: "Organization context required" });
  }

  // Safety: if both present and conflict, reject
  if (sessOrg && headerOrg && sessOrg !== headerOrg) {
    console.log(`[TICKET_ACCESS] 400 - Org mismatch: session=${sessOrg}, header=${headerOrg}`);
    return res.status(400).json({ error: "Organization mismatch between session and header" });
  }

  req.orgId = chosen;
  console.log(`[TICKET_ACCESS] Regular user access granted to org: ${chosen}`);
  next();
}

/**
 * Middleware to require support staff role for support portal routes.
 * This ensures only support staff can access support-specific features.
 */
export function requireSupportStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.isSupportStaff) {
    return res.status(403).json({ 
      error: "Support staff access required",
      message: "This endpoint is only accessible to support staff members"
    });
  }

  console.log(`[SUPPORT_STAFF] Access granted to support staff: ${req.user?.id}`);
  next();
}

/**
 * Middleware to enforce org isolation for non-ticket routes even for support staff.
 * Support staff should only have cross-org access for ticket data.
 */
export async function requireOrgForNonTickets(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Even support staff must respect org boundaries for non-ticket data
  let orgId: string | undefined;

  if (req.isSupportStaff) {
    // Support staff accessing non-ticket data should use their own org
    orgId = req.supportStaffOrgId;
    console.log(`[ORG_ISOLATION] Support staff ${req.user?.id} accessing non-ticket data in their org: ${orgId}`);
  } else {
    // Regular org resolution for non-support staff
    const isProd = process.env.NODE_ENV === "production";
    const sessOrg = (req.session as any)?.orgId as string | undefined;
    const headerOrg = (req.headers["x-org-id"] as string | undefined) || undefined;

    orgId = isProd ? sessOrg : (sessOrg || headerOrg);

    // Fallback from user row
    if (!orgId) {
      const r: any = await db.execute(sql`
        SELECT org_id FROM users WHERE id = ${userId}::uuid
      `);
      orgId = r[0]?.org_id;
    }
  }

  if (!orgId) {
    console.log(`[ORG_ISOLATION] 401 - No org context available: userId=${userId}, isSupportStaff=${req.isSupportStaff}`);
    return res.status(401).json({ error: "Organization context required" });
  }

  req.orgId = orgId;
  next();
}