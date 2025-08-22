import type { Request, Response, NextFunction } from "express";

function header(req: Request, name: string): string | undefined {
  return (req.headers[name.toLowerCase()] as string | undefined) || undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hUser =
    header(req, "x-user-id") ||
    header(req, "x-userid") ||
    header(req, "x-user") ||
    (req.query.userId as string | undefined);

  const auth = header(req, "authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  const userId = hUser || bearer;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  (req as any).user = { id: userId };
  next();
}
