import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
export function requireOrg(req: Request, res: Response, next: NextFunction) {
  const orgId = (req as any).user?.orgId || (req.headers["x-org-id"] as string) || (req.query.orgId as string);
  if (!orgId) return res.status(400).json({ error: "No organization in session" });
  (req as any).orgId = orgId; next();
}
export async function requirePro(req: Request, res: Response, next: NextFunction) {
  const orgId = (req as any).orgId as string;
  try {
    const r:any = await db.execute(sql`select active from entitlements where org_id=${orgId}::uuid`);
    if (!r.rows?.[0]?.active) return res.status(402).json({ error: "Upgrade required" });
    next();
  } catch { return res.status(500).json({ error: "Entitlement check failed" }); }
}
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-super-admin"] === "1") return next();
  return res.status(403).json({ error: "Super admin only" });
}