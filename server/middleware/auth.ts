import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // SECURITY: Only allow dev headers in development environment
  if (process.env.NODE_ENV !== 'production') {
    // Support dev headers for backward compatibility in development only
    const hUser =
      header(req, "x-user-id") ||
      header(req, "x-userid") ||
      header(req, "x-user") ||
      (req.query.userId as string | undefined);

    const hOrg = 
      header(req, "x-org-id") ||
      header(req, "x-orgid") ||
      (req.query.orgId as string | undefined);

    if (hUser) {
      req.user = { id: hUser };
      if (hOrg) {
        req.orgId = hOrg;
      }
      // Set RLS context for dev headers
      try {
        // Use direct SQL string construction for SET commands (session-scoped for RLS)
        await db.execute(sql.raw(`SET app.current_user_id = '${hUser.replace(/'/g, "''")}'`));
        if (hOrg) {
          await db.execute(sql.raw(`SET app.current_org = '${hOrg.replace(/'/g, "''")}'`));
        }
      } catch (error) {
        console.error("[AUTH] Error setting RLS context for dev headers:", error);
      }
      return next();
    }
  }

  // Check session auth
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  // Enhanced user lookup to include role information
  try {
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id, email, name
      FROM users 
      WHERE id = ${userId}::uuid
    `);
    
    const user = userResult[0];
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = { id: user.id, role: user.role };
    
    // SECURITY FIX: Do NOT automatically trust database role for support staff privileges
    // Support staff privileges must be granted only via cryptographically verified tokens
    // The detectSupportStaff middleware handles secure support staff detection
    
    // Set org context for regular users only
    if (user.role !== 'support_staff') {
      // Regular users get their org context
      if (req.session.orgId) {
        req.orgId = req.session.orgId;
      } else if (user.org_id) {
        req.orgId = user.org_id;
      }
    }

    // Set RLS context for authenticated session
    try {
      // Use direct SQL string construction for SET commands (session-scoped for RLS)
      await db.execute(sql.raw(`SET app.current_user_id = '${user.id.replace(/'/g, "''")}'`));
      // Only set org context for regular users (verified support staff handled separately)
      if (req.orgId && !req.isSupportStaff) {
        await db.execute(sql.raw(`SET app.current_org = '${req.orgId.replace(/'/g, "''")}'`));
      }
      console.log(`[AUTH] RLS context set for user ${user.id}, org: ${req.orgId || 'cross-org'}`);
    } catch (error) {
      console.error("[AUTH] Error setting RLS context:", error);
      // Continue without RLS context - policies will handle access control
    }
    
    next();
  } catch (error) {
    console.error("[AUTH] Error during enhanced authentication:", error);
    // Fallback to basic auth
    req.user = { id: userId };
    if (req.session.orgId) {
      req.orgId = req.session.orgId;
    }
    next();
  }
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.orgId) {
    return res.status(400).json({ error: "Organization required" });
  }
  next();
}
