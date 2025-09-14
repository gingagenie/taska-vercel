import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

// Extend Express Request interface for support user context
declare global {
  namespace Express {
    interface Request {
      supportUser?: {
        id: string;
        email: string;
        name: string;
        role: string;
        isActive: boolean;
      };
      isSupportRequest?: boolean;
    }
  }
}

/**
 * Support authentication middleware - completely separate from customer auth
 * Validates support staff sessions and sets req.supportUser
 */
export async function supportRequireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Mark this as a support request for routing purposes
    req.isSupportRequest = true;
    
    // Check for support user session
    const supportUserId = req.session?.supportUserId;
    if (!supportUserId) {
      return res.status(401).json({ error: "Support authentication required" });
    }

    // Validate support user in database
    const result: any = await db.execute(sql`
      SELECT id, name, email, role, is_active, last_login_at
      FROM support_users 
      WHERE id = ${supportUserId}::uuid
      AND is_active = true
    `);
    
    const supportUser = result[0];
    if (!supportUser) {
      // Support user not found or inactive - clear session
      req.session.supportUserId = undefined;
      req.session.supportUserRole = undefined;
      
      console.log(`[SUPPORT AUTH] Invalid or inactive support user session: ${supportUserId}`);
      return res.status(401).json({ error: "Support user not found or inactive" });
    }

    // Set support user context
    req.supportUser = {
      id: supportUser.id,
      email: supportUser.email,
      name: supportUser.name,
      role: supportUser.role,
      isActive: supportUser.is_active
    };

    // Log successful authentication for audit
    console.log(`[SUPPORT AUTH] Authenticated support user: ${supportUser.email} (${supportUser.role})`);
    
    next();
  } catch (error) {
    console.error("[SUPPORT AUTH] Authentication error:", error);
    res.status(500).json({ error: "Support authentication failed" });
  }
}

/**
 * Support admin role middleware - requires support_admin role
 * Use this for admin-only operations like user management
 */
export async function supportRequireAdmin(req: Request, res: Response, next: NextFunction) {
  // First ensure support authentication
  if (!req.supportUser) {
    return res.status(401).json({ error: "Support authentication required" });
  }

  // Check for admin role
  if (req.supportUser.role !== 'support_admin') {
    // Log unauthorized admin access attempt
    try {
      await db.execute(sql`
        INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
        VALUES ('admin_access_denied', ${req.supportUser.id}, ${JSON.stringify({ 
          endpoint: req.path,
          method: req.method,
          role: req.supportUser.role 
        })}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
      `);
    } catch (auditError) {
      console.error("[SUPPORT AUTH] Audit log error:", auditError);
    }
    
    console.log(`[SUPPORT AUTH] Admin access denied for ${req.supportUser.email} (role: ${req.supportUser.role})`);
    return res.status(403).json({ error: "Support admin role required" });
  }

  console.log(`[SUPPORT AUTH] Admin access granted for ${req.supportUser.email}`);
  next();
}

/**
 * Support user role middleware - requires support_user or support_admin role
 * Use this for regular support operations accessible to all support staff
 */
export async function supportRequireUser(req: Request, res: Response, next: NextFunction) {
  // First ensure support authentication
  if (!req.supportUser) {
    return res.status(401).json({ error: "Support authentication required" });
  }

  // Check for valid support role
  const validRoles = ['support_user', 'support_admin'];
  if (!validRoles.includes(req.supportUser.role)) {
    console.log(`[SUPPORT AUTH] Invalid support role: ${req.supportUser.role} for ${req.supportUser.email}`);
    return res.status(403).json({ error: "Valid support role required" });
  }

  next();
}

/**
 * Optional support authentication - sets req.supportUser if authenticated but doesn't require it
 * Useful for endpoints that should work for both authenticated and unauthenticated requests
 */
export async function supportOptionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    req.isSupportRequest = true;
    
    const supportUserId = req.session?.supportUserId;
    if (!supportUserId) {
      return next(); // Continue without authentication
    }

    // Try to validate support user
    const result: any = await db.execute(sql`
      SELECT id, name, email, role, is_active
      FROM support_users 
      WHERE id = ${supportUserId}::uuid
      AND is_active = true
    `);
    
    const supportUser = result[0];
    if (supportUser) {
      req.supportUser = {
        id: supportUser.id,
        email: supportUser.email,
        name: supportUser.name,
        role: supportUser.role,
        isActive: supportUser.is_active
      };
    }

    next();
  } catch (error) {
    console.error("[SUPPORT AUTH] Optional authentication error:", error);
    // Continue without authentication on error
    next();
  }
}

/**
 * Audit logging helper for support actions
 * Call this to log important support staff actions
 */
export async function logSupportAction(
  action: string,
  supportUserId: string,
  details: any,
  req: Request
) {
  try {
    await db.execute(sql`
      INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
      VALUES (${action}, ${supportUserId}, ${JSON.stringify(details)}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
    `);
  } catch (error) {
    console.error("[SUPPORT AUTH] Audit logging error:", error);
  }
}