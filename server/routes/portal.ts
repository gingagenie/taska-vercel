// server/routes/portal.ts
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

// IMPORTANT: reuse the existing jobs router (DO NOT reimplement PDFs)
import jobsRouter from "./jobs";

const portalRouter = Router();

// --------------------------------------------------
// helpers
// --------------------------------------------------
function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

/**
 * Try hard to find a portal customer id from ANY session shape we might have created
 * over the last few refactors.
 */
function extractPortalCustomerId(req: any): string | null {
  const candidates = [
    req?.session?.portalCustomerId,
    req?.session?.customerId,
    req?.session?.customer?.id,

    // a bunch of “just in case” nests seen in refactors
    req?.session?.portal?.customerId,
    req?.session?.portal?.customer?.id,
    req?.session?.portalCustomer?.id,
    req?.session?.portalSession?.customerId,
    req?.session?.portalSession?.customer?.id,

    // sometimes people shove it into "user"
    req?.session?.user?.customerId,
    req?.session?.user?.customer_id,

    // last resort: if someone mistakenly put the customer object on session.user
    // ONLY accept it if it looks like a uuid
    req?.session?.user?.id,
  ].filter(Boolean);

  for (const v of candidates) {
    const s = String(v);
    if (isUuid(s)) return s;
  }
  return null;
}

/**
 * Canonicalise portal session markers so all routes behave consistently.
 * This is the missing piece that stops the “works one minute / not authenticated next minute” loop.
 */
async function ensurePortalSession(req: any, res: any): Promise<string | null> {
  const customerId = extractPortalCustomerId(req);
  if (!customerId) return null;

  // Write back the canonical fields that the portal + jobs routes expect.
  req.session.portalCustomerId = customerId;
  req.session.customerId = customerId;
  req.session.customer = { id: customerId };

  // Not strictly required, but useful for bypass checks
  req.isPortal = true;

  // Force-save (best effort). Don’t block the request if save fails.
  try {
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
  } catch {
    // ignore
  }

  return customerId;
}

/**
 * A small guard you can reuse everywhere in this file.
 */
async function requirePortalCustomer(req: any, res: any): Promise<string> {
  const cid = await ensurePortalSession(req, res);
  if (!cid) {
    res.status(401).json({ error: "Not authenticated" });
    throw new Error("PORTAL_NOT_AUTHENTICATED");
  }
  return cid;
}

// --------------------------------------------------
// (Optional but VERY useful) debug endpoint
// Shows whether the session contains portal markers (no sensitive values)
// --------------------------------------------------
portalRouter.get("/portal/:org/_debug/session", async (req: any, res: any) => {
  const has = (v: any) => (v ? true : false);
  res.json({
    ok: true,
    cookieSeen: Boolean(req.headers?.cookie),
    taskaSidPresent: Boolean(req.headers?.cookie?.includes("taska.sid=")),
    markers: {
      portalCustomerId: has(req.session?.portalCustomerId),
      customerId: has(req.session?.customerId),
      customerObj: has(req.session?.customer?.id),
      portalNested: has(req.session?.portal?.customerId || req.session?.portal?.customer?.id),
      portalSessionNested: has(req.session?.portalSession?.customerId || req.session?.portalSession?.customer?.id),
      userCustomerId: has(req.session?.user?.customerId || req.session?.user?.customer_id),
      userIdLooksLikeUuid: isUuid(String(req.session?.user?.id || "")),
    },
  });
});

// --------------------------------------------------
// PORTAL: equipment list / detail routes
// --------------------------------------------------

// example: GET /api/portal/:org/equipment
portalRouter.get("/portal/:org/equipment", async (req: any, res: any) => {
  try {
    const customerId = await requirePortalCustomer(req, res);

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number
      FROM equipment
      WHERE customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    res.json(r);
  } catch (e: any) {
    if (e?.message === "PORTAL_NOT_AUTHENTICATED") return;
    console.error("[portal equipment list]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// example: GET /api/portal/:org/equipment/:id
portalRouter.get("/portal/:org/equipment/:id", async (req: any, res: any) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid equipment id" });
  }

  try {
    const customerId = await requirePortalCustomer(req, res);

    const equipmentRows: any = await db.execute(sql`
      SELECT *
      FROM equipment
      WHERE id = ${id}::uuid
        AND customer_id = ${customerId}::uuid
      LIMIT 1
    `);

    if (!equipmentRows.length) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    // NOTE: if you want equipment-specific history, you'll need a join table.
    // Keeping your existing behavior (all completed jobs for this customer).
    const jobs: any = await db.execute(sql`
      SELECT
        cj.id,
        cj.title,
        cj.completed_at
      FROM completed_jobs cj
      WHERE cj.customer_id = ${customerId}::uuid
      ORDER BY cj.completed_at DESC
    `);

    res.json({
      equipment: equipmentRows[0],
      jobs,
    });
  } catch (e: any) {
    if (e?.message === "PORTAL_NOT_AUTHENTICATED") return;
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// --------------------------------------------------
// ✅ PORTAL SERVICE SHEET (reuse existing jobs router)
// --------------------------------------------------
// GET /api/portal/:org/completed-jobs/:completedJobId/service-sheet
// --------------------------------------------------

portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;

    if (!completedJobId || !isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    // Canonicalise session markers first
    let customerId: string | null = null;
    try {
      customerId = await requirePortalCustomer(req, res);
    } catch {
      return; // response already sent
    }

    try {
      // find org + validate ownership
      const r: any = await db.execute(sql`
        SELECT org_id, customer_id
        FROM completed_jobs
        WHERE id = ${completedJobId}::uuid
        LIMIT 1
      `);

      if (!r?.length) {
        return res.status(404).json({ error: "Completed job not found" });
      }

      if (r[0].customer_id && String(r[0].customer_id) !== String(customerId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // 👇 CRITICAL FLAGS for downstream middleware
      req.isPortal = true; // subscription middleware bypasses
      req.customerId = customerId;
      req.orgId = r[0].org_id;

      // 👇 forward into the EXISTING jobs router endpoint
      // Keep query string (?download=1 etc)
      const qs = req._parsedUrl?.search || "";
      req.url = `/completed/${completedJobId}/service-sheet${qs}`;

      return (jobsRouter as any)(req, res, next);
    } catch (e: any) {
      console.error("[portal service sheet]", e);
      res.status(500).json({ error: e?.message || "Failed to generate PDF" });
    }
  }
);

export default portalRouter;
