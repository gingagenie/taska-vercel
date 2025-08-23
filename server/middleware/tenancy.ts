import type { Request, Response, NextFunction } from "express";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  // Support dev headers for backward compatibility  
  const hOrg =
    header(req, "x-org-id") ||
    header(req, "x-orgid") ||
    header(req, "x-organization-id") ||
    (req.query.orgId as string | undefined);

  if (hOrg) {
    (req as any).orgId = hOrg;
    return next();
  }

  // Check session org
  const orgId = req.session.orgId;
  if (!orgId) {
    return res.status(400).json({ error: "No organization selected" });
  }

  (req as any).orgId = orgId;
  next();
}
