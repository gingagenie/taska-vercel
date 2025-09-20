import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { verifyAccessToken, isJwtAuthDisabled } from "../lib/jwt-auth-tokens";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Emergency kill switch: If JWT auth is disabled, skip JWT auth entirely
  const jwtDisabled = isJwtAuthDisabled();
  if (jwtDisabled) {
    console.log('[HYBRID AUTH] JWT authentication disabled via kill switch, using session-only mode');
  }

  // STEP 1: Check for JWT Token Authentication (iOS ONLY)
  // This must be checked FIRST before falling back to session cookies
  if (!jwtDisabled) {
    const authHeader = header(req, "authorization");
    const authMode = header(req, "x-auth-mode");
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7); // Remove "Bearer " prefix
      
      console.log(`[HYBRID AUTH] JWT token authentication attempt, auth-mode: ${authMode || 'not-specified'}`);
      
      try {
        const tokenPayload = await verifyAccessToken(token);
        if (tokenPayload) {
          // Token is valid - set up authentication context
          req.user = { 
            id: tokenPayload.userId, 
            role: tokenPayload.role 
          };
          
          if (tokenPayload.orgId) {
            req.orgId = tokenPayload.orgId;
          }

          // Mark this as JWT-authenticated for logging
          (req as any).authMethod = 'jwt';
          (req as any).authPlatform = tokenPayload.platform;

          // Set RLS context for JWT auth
          try {
            await db.execute(sql.raw(`SET app.current_user_id = '${tokenPayload.userId.replace(/'/g, "''")}'`));
            if (tokenPayload.orgId) {
              await db.execute(sql.raw(`SET app.current_org = '${tokenPayload.orgId.replace(/'/g, "''")}'`));
            }
            console.log(`[HYBRID AUTH] JWT: RLS context set for user ${tokenPayload.userId}, org: ${tokenPayload.orgId || 'cross-org'}, mode: ${authMode || 'unknown'}`);
          } catch (error) {
            console.error("[HYBRID AUTH] JWT: Error setting RLS context:", error);
          }
          
          console.log(`[HYBRID AUTH] JWT authentication successful for ${tokenPayload.platform} user ${tokenPayload.userId}`);
          return next();
        } else {
          console.log('[HYBRID AUTH] JWT token verification failed, falling back to session auth');
        }
      } catch (error) {
        console.error('[HYBRID AUTH] JWT token verification error:', error);
        // Don't return error here - fall back to session auth
      }
    }
  }

  // STEP 2: Development Headers (unchanged for backward compatibility)
  // SECURITY: Only allow dev headers in development environment
  if (process.env.NODE_ENV !== 'production') {
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
      
      // Mark as dev header auth
      (req as any).authMethod = 'dev-headers';
      
      // Set RLS context for dev headers
      try {
        await db.execute(sql.raw(`SET app.current_user_id = '${hUser.replace(/'/g, "''")}'`));
        if (hOrg) {
          await db.execute(sql.raw(`SET app.current_org = '${hOrg.replace(/'/g, "''")}'`));
        }
        console.log(`[HYBRID AUTH] DEV: RLS context set for user ${hUser}, org: ${hOrg || 'none'}`);
      } catch (error) {
        console.error("[HYBRID AUTH] DEV: Error setting RLS context for dev headers:", error);
      }
      return next();
    }
  }

  // STEP 3: Session Cookie Authentication (Web/Android - UNCHANGED)
  // This preserves existing behavior for web and Android users
  const userId = req.session.userId;
  if (!userId) {
    console.log('[HYBRID AUTH] No authentication found (no JWT token, no dev headers, no session)');
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  console.log(`[HYBRID AUTH] Session authentication attempt for user ${userId}`);
  
  // Enhanced user lookup to include role information
  try {
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id, email, name
      FROM users 
      WHERE id = ${userId}::uuid
    `);
    
    const user = userResult[0];
    if (!user) {
      console.log(`[HYBRID AUTH] Session user not found: ${userId}`);
      return res.status(401).json({ error: "User not found" });
    }

    req.user = { id: user.id, role: user.role };
    
    // Mark as session auth
    (req as any).authMethod = 'session-cookie';
    
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
      await db.execute(sql.raw(`SET app.current_user_id = '${user.id.replace(/'/g, "''")}'`));
      // Only set org context for regular users (verified support staff handled separately)
      if (req.orgId && !req.isSupportStaff) {
        await db.execute(sql.raw(`SET app.current_org = '${req.orgId.replace(/'/g, "''")}'`));
      }
      console.log(`[HYBRID AUTH] SESSION: RLS context set for user ${user.id}, org: ${req.orgId || 'cross-org'}`);
    } catch (error) {
      console.error("[HYBRID AUTH] SESSION: Error setting RLS context:", error);
      // Continue without RLS context - policies will handle access control
    }
    
    console.log(`[HYBRID AUTH] Session authentication successful for user ${user.id}`);
    next();
  } catch (error) {
    console.error("[HYBRID AUTH] Error during session authentication:", error);
    // Fallback to basic auth
    req.user = { id: userId };
    if (req.session.orgId) {
      req.orgId = req.session.orgId;
    }
    (req as any).authMethod = 'session-fallback';
    console.log(`[HYBRID AUTH] Using fallback session auth for user ${userId}`);
    next();
  }
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.orgId) {
    return res.status(400).json({ error: "Organization required" });
  }
  next();
}
