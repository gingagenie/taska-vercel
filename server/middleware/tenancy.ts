import { Request, Response, NextFunction } from "express";

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  const sessOrg = (req.session as any)?.orgId as string | undefined;
  const headerOrg = (req.headers["x-org-id"] as string | undefined) || undefined;

  const isProd = process.env.NODE_ENV === "production";
  // In prod: always use session. In dev: allow header ONLY if no session.
  const chosen = isProd ? sessOrg : (sessOrg || headerOrg);

  if (!chosen) return res.status(400).json({ error: "No organization selected" });

  // Extra safety: if both present and conflict, reject.
  if (sessOrg && headerOrg && sessOrg !== headerOrg) {
    return res.status(400).json({ error: "Org mismatch between session and header" });
  }

  (req as any).orgId = chosen;
  next();
}