import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { verifyAccessToken, isJwtAuthDisabled } from "../lib/jwt-auth-tokens";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const jwtDisabled = isJwtAuthDisabled();

  // STEP 1: JWT Token Authentication (iOS)
  if (!jwtDisabled) {
    const authHeader = header(req, "authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const tokenPayload = await verifyAccessToken(token);
        if (tokenPayload) {
          req.user = { id: tokenPayload.userId, role: tokenPayload.role };
          if (tokenPayload.orgId) req.orgId = tokenPayload.orgId;
          (req as any).authMethod = 'jwt';
          (req as any).authPlatform = tokenPayload.platform;
          try {
            await db.execute(sql.raw(`SET app.current_user_id = '${tokenPayload.userId.replace(/'/g, "''")}'`));
            if (tokenPayload.orgId) {
              await db.execute(sql.raw(`SET app.current_org = '${tokenPayload.orgId.replace(/'/g, "''")}'`));
            }
          } catch (error) {
            console.error("[AUTH] JWT: Error setting RLS context:", error);
          }
          return next();
        }
      } catch (error) {
        console.error('[AUTH] JWT token verification error:', error);
      }
    }
  }

  // STEP 2: Development Headers
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
      if (hOrg) req.orgId = hOrg;
      (req as any).authMethod = 'dev-headers';
      try {
        await db.execute(sql.raw(`SET app.current_user_id = '${hUser.replace(/'/g, "''")}'`));
        if (hOrg) await db.execute(sql.raw(`SET app.current_org = '${hOrg.replace(/'/g, "''")}'`));
      } catch (error) {
        console.error("[AUTH] DEV: Error setting RLS context:", error);
      }
      return next();
    }
  }

  // STEP 3: Session Cookie Authentication
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id, email, name FROM users WHERE id = ${userId}::uuid
    `);
    const user = userResult[0];
    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = { id: user.id, role: user.role };
    (req as any).authMethod = 'session-cookie';

    if (user.role !== 'support_staff') {
      if (req.session.orgId) req.orgId = req.session.orgId;
      else if (user.org_id) req.orgId = user.org_id;
    }

    try {
      await db.execute(sql.raw(`SET app.current_user_id = '${user.id.replace(/'/g, "''")}'`));
      if (req.orgId && !req.isSupportStaff) {
        await db.execute(sql.raw(`SET app.current_org = '${req.orgId.replace(/'/g, "''")}'`));
      }
    } catch (error) {
      console.error("[AUTH] SESSION: Error setting RLS context:", error);
    }

    next();
  } catch (error) {
    console.error("[AUTH] Error during session authentication:", error);
    req.user = { id: userId };
    if (req.session.orgId) req.orgId = req.session.orgId;
    (req as any).authMethod = 'session-fallback';
    next();
  }
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.orgId) return res.status(400).json({ error: "Organization required" });
  next();
}
