import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { verifySupportToken } from "../lib/secure-support-token";

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
 * SECURITY-HARDENED: Middleware to detect support staff using only cryptographically verified tokens.
 * 
 * This middleware only trusts support tokens that are cryptographically signed and cannot be forged.
 * ALL REFERENCES TO FORGEABLE COOKIES HAVE BEEN REMOVED for security.
 */
export async function detectSupportStaff(req: Request, res: Response, next: NextFunction) {
  try {
    let isVerifiedSupportStaff = false;
    let supportUserId: string | null = null;
    let supportUserRole: string | null = null;
    let detectionMethod = 'none';

    // SECURITY FIX: Only trust cryptographically verified support tokens
    // Step 1: Check for secure support token (cryptographically signed, cannot be forged)
    const supportToken = req.cookies?.support_token;
    if (supportToken) {
      const tokenPayload = verifySupportToken(supportToken);
      if (tokenPayload) {
        // Token is cryptographically verified - safe to trust
        isVerifiedSupportStaff = true;
        supportUserId = tokenPayload.supportUserId;
        supportUserRole = tokenPayload.role;
        detectionMethod = 'verified_token';
        
        console.log(`[SUPPORT_STAFF] VERIFIED support staff via secure token: ${supportUserId} (${tokenPayload.role})`);
        
        // Fetch additional user details from database for context
        try {
          const userResult: any = await db.execute(sql`
            SELECT id, email, name, org_id
            FROM support_users 
            WHERE id = ${supportUserId}::uuid
            AND is_active = true
          `);
          
          const supportUser = userResult[0];
          if (supportUser) {
            req.supportStaffOrgId = supportUser.org_id;
            req.user = {
              id: supportUser.id,
              role: supportUserRole
            };
          }
        } catch (dbError) {
          console.error(`[SUPPORT_STAFF] Database lookup error for verified token: ${dbError}`);
        }
      } else {
        // Invalid token - possible forgery attempt
        console.warn(`[SUPPORT_STAFF] SECURITY: Invalid support token detected - possible forgery from IP ${req.ip}`);
      }
    }

    // Step 2: Fallback to session-based verification (for support portal routes)
    if (!isVerifiedSupportStaff) {
      const sessionSupportUserId = req.session?.supportUserId;
      if (sessionSupportUserId) {
        // Verify session support user exists and is active
        try {
          const sessionUserResult: any = await db.execute(sql`
            SELECT id, role, email, name, org_id, is_active
            FROM support_users 
            WHERE id = ${sessionSupportUserId}::uuid
            AND is_active = true
          `);
          
          const sessionUser = sessionUserResult[0];
          if (sessionUser) {
            isVerifiedSupportStaff = true;
            supportUserId = sessionUser.id;
            supportUserRole = sessionUser.role;
            detectionMethod = 'verified_session';
            
            req.supportStaffOrgId = sessionUser.org_id;
            req.user = {
              id: sessionUser.id,
              role: sessionUser.role
            };
            
            console.log(`[SUPPORT_STAFF] VERIFIED support staff via session: user_id ${sessionUser.id}`);
          } else {
            console.warn(`[SUPPORT_STAFF] Invalid session support user ID: ${sessionSupportUserId}`);
            // Clear invalid session
            req.session.supportUserId = undefined;
            req.session.supportUserRole = undefined;
          }
        } catch (dbError) {
          console.error(`[SUPPORT_STAFF] Session verification error: ${dbError}`);
        }
      }
    }

    // Set verified support staff status
    req.isSupportStaff = isVerifiedSupportStaff;
    
    if (isVerifiedSupportStaff) {
      console.log(`[SUPPORT_STAFF] Support staff access granted via ${detectionMethod}: ${supportUserId}`);
    }

    next();
  } catch (error) {
    console.error("[SUPPORT_STAFF] Error in secure support staff detection:", error);
    // SECURITY: Fail closed - do not grant support staff privileges on error
    req.isSupportStaff = false;
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