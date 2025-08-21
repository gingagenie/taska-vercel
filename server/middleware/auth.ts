import type { Request, Response, NextFunction } from "express";
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.headers["x-user-id"] as string) || null;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  (req as any).user = { id: userId };
  next();
}