import type { Request, Response, NextFunction } from "express";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Support dev headers for backward compatibility
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
    return next();
  }

  // Check session auth
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  req.user = { id: userId };
  if (req.session.orgId) {
    req.orgId = req.session.orgId;
  }
  next();
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.orgId) {
    return res.status(400).json({ error: "Organization required" });
  }
  next();
}
