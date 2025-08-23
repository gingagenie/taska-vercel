import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

export const debugRouter = Router();

/** Debug whoami (session + effective org) */
debugRouter.get("/whoami", requireAuth, requireOrg, (req, res) => {
  res.json({
    env: process.env.NODE_ENV,
    sessionUserId: (req.session as any)?.userId || null,
    sessionOrgId: (req.session as any)?.orgId || null,
    effectiveOrgId: (req as any).orgId || null,
  });
});