// server/middleware/customerAuth.ts
export function requireCustomerAuth(req: any, res: any, next: any) {
  // Portal auth can be session-based OR token-based — keep it simple for now.
  // If you already store a portal/customer login in session, this will work immediately.
  const ok =
    Boolean(req.session?.customerId) ||
    Boolean(req.session?.portalCustomerId) ||
    Boolean(req.session?.userId); // allows logged-in staff too (handy while testing)

  if (!ok) return res.status(401).json({ error: "Not authenticated" });
  next();
}
