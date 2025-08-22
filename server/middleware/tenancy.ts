import type { Request, Response, NextFunction } from "express";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  const orgId =
    header(req, "x-org-id") ||
    header(req, "x-orgid") ||
    header(req, "x-organization-id") ||
    (req.query.orgId as string | undefined);

  if (!orgId) return res.status(400).json({ error: "Missing org id" });

  (req as any).orgId = orgId;
  next();
}
