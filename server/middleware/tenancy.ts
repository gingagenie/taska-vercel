import { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export async function requireOrg(req: Request, res: Response, next: NextFunction) {
  const sessOrg = (req.session as any)?.orgId as string | undefined;
  const headerOrg = (req.headers["x-org-id"] as string | undefined) || undefined;
  const isProd = process.env.NODE_ENV === "production";

  let chosen = isProd ? sessOrg : (sessOrg || headerOrg);

  // 🔁 Fallback: if we have a user but no org yet (mobile not sending cookie),
  // derive the org from the user row once.
  if (!chosen && (req.session as any)?.userId) {
    const userId = (req.session as any).userId as string;
    try {
      const r: any = await db.execute(sql`
        select org_id from users where id=${userId}::uuid
      `);
      const derived = r.rows?.[0]?.org_id;
      if (derived) chosen = derived;
    } catch (error) {
      console.error("Failed to derive org from user:", error);
    }
  }

  if (!chosen) return res.status(401).json({ error: "Not authenticated" });

  // Safety: if both present and conflict, reject
  if (sessOrg && headerOrg && sessOrg !== headerOrg) {
    return res.status(400).json({ error: "Org mismatch between session and header" });
  }

  // Extra safety: verify org exists in database (critical without FK constraint)
  // Skip validation in development mode for performance
  if (process.env.NODE_ENV === "production") {
    try {
      const orgCheck: any = await db.execute(sql`
        select id from orgs where id=${chosen}::uuid
      `);
      if (!orgCheck.rows?.[0]) {
        return res.status(400).json({ error: "Organization not found" });
      }
    } catch (error) {
      console.error("Org validation error:", error);
      return res.status(500).json({ error: "Failed to validate organization" });
    }
  }

  (req as any).orgId = chosen;
  next();
}