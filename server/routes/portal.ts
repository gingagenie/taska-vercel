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

// ✅ PORTAL LOGIN — THIS IS THE FIX
// POST /api/portal/:org/login
portalRouter.post("/portal/:org/login", async (req: any, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // ⚠️ adjust table/columns ONLY if your schema is different
    const rows: any = await db.execute(sql`
      SELECT id, email, password_hash
      FROM customers
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `);

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const customer = rows[0];

    const bcrypt = (await import("bcryptjs")).default;
    const ok = await bcrypt.compare(password, customer.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔑 THIS IS THE IMPORTANT BIT
    req.session.portalCustomerId = customer.id;
    req.session.customer = { id: customer.id, email: customer.email };

    // 🔒 FORCE SESSION SAVE (THIS WAS MISSING)
    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => (err ? reject(err) : resolve()));
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error("[portal login]", e);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * ✅ Robust portal customerId extraction.
 * This is the real fix for your "login 200 but equipment 401" loop.
 */
function getPortalCustomerId(req: any): string | null {
  return (
    req?.session?.portalCustomerId ||
    req?.session?.customerId ||
    req?.session?.customer?.id ||
    req?.session?.portal?.customerId ||
    req?.session?.portal?.customer?.id ||
    req?.session?.portalCustomer?.id ||
    req?.session?.portalSession?.customerId ||
    req?.session?.portalSession?.customer?.id ||
    req?.session?.portalAuth?.customerId ||
    req?.session?.portalAuth?.customer?.id ||
    null
  );
}

// --------------------------------------------------
// PORTAL: equipment list / detail routes
// --------------------------------------------------

// GET /api/portal/:org/equipment
portalRouter.get("/portal/:org/equipment", async (req: any, res) => {
  try {
    const customerId = getPortalCustomerId(req);

    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number
      FROM equipment
      WHERE customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    res.json(r);
  } catch (e: any) {
    console.error("[portal equipment list]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// GET /api/portal/:org/equipment/:id
portalRouter.get("/portal/:org/equipment/:id", async (req: any, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid equipment id" });
  }

  try {
    const customerId = getPortalCustomerId(req);

    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

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

    const jobs: any = await db.execute(sql`
      SELECT cj.id, cj.title, cj.completed_at
      FROM completed_jobs cj
      WHERE cj.customer_id = ${customerId}::uuid
      ORDER BY cj.completed_at DESC
    `);

    res.json({
      equipment: equipmentRows[0],
      jobs,
    });
  } catch (e: any) {
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// --------------------------------------------------
// ✅ PORTAL SERVICE SHEET (reuses existing jobs router)
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

    const customerId = getPortalCustomerId(req);

    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
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

      // ✅ CRITICAL FLAGS for downstream middleware
      req.isPortal = true; // lets subscription middleware bypass
      req.customerId = customerId;
      req.orgId = r[0].org_id;

      // ✅ forward into EXISTING /api/jobs/completed/:id/service-sheet route
      req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;

      return (jobsRouter as any)(req, res, next);
    } catch (e: any) {
      console.error("[portal service sheet]", e);
      res.status(500).json({ error: e?.message || "Failed to generate PDF" });
    }
  }
);

export default portalRouter;
