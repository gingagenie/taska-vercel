// server/routes/portal.ts
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import jobsRouter from "./jobs";

const portalRouter = Router();

function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

/** ONE source of truth for portal auth */
function requirePortalAuth(req: any, res: any, next: any) {
  const portalCustomerId = req.session?.portalCustomerId || null;
  if (!portalCustomerId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.portalCustomerId = portalCustomerId;
  return next();
}

/* ---------------------------
   PORTAL LOGIN (UNIFIED)
   POST /api/portal/:org/login
   --------------------------- */
portalRouter.post("/portal/:org/login", async (req: any, res) => {
  try {
    const { email, password } = req.body || {};

    // UI field is called "email" but your DB uses customer_users.name
    const identifier = String(email || "").trim();
    const pass = String(password || "");

    if (!identifier || !pass) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // ✅ correct table + column based on your screenshot
    const rows: any = await db.execute(sql`
      SELECT id, name, password_hash, disabled_at
      FROM customer_users
      WHERE lower(name) = lower(${identifier})
      LIMIT 1
    `);

    if (!rows?.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    if (user.disabled_at) {
      return res.status(403).json({ error: "Account disabled" });
    }

    const bcrypt = (await import("bcryptjs")).default;
    const ok = await bcrypt.compare(pass, user.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // ✅ ONE session marker only
    req.session.portalCustomerId = user.id;
    req.session.portalUser = { id: user.id, name: user.name };

    // ✅ force save so next request sees it
    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => (err ? reject(err) : resolve()));
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[portal login]", e);
    return res.status(500).json({ error: e?.message || "Login failed" });
  }
});

/* ---------------------------
   EQUIPMENT LIST
   GET /api/portal/:org/equipment
   --------------------------- */
portalRouter.get("/portal/:org/equipment", requirePortalAuth, async (req: any, res) => {
  try {
    const customerId = req.portalCustomerId;

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number
      FROM equipment
      WHERE customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    return res.json(r);
  } catch (e: any) {
    console.error("[portal equipment list]", e);
    return res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

/* ---------------------------
   EQUIPMENT DETAIL
   GET /api/portal/:org/equipment/:id
   --------------------------- */
portalRouter.get("/portal/:org/equipment/:id", requirePortalAuth, async (req: any, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid equipment id" });
  }

  try {
    const customerId = req.portalCustomerId;

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

    return res.json({ equipment: equipmentRows[0], jobs });
  } catch (e: any) {
    console.error("[portal equipment detail]", e);
    return res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

/* ---------------------------
   PORTAL PDF REUSE
   GET /api/portal/:org/completed-jobs/:completedJobId/service-sheet
   --------------------------- */
portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  requirePortalAuth,
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!completedJobId || !isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const customerId = req.portalCustomerId;

    try {
      const r: any = await db.execute(sql`
        SELECT org_id, customer_id
        FROM completed_jobs
        WHERE id = ${completedJobId}::uuid
        LIMIT 1
      `);

      if (!r?.length) return res.status(404).json({ error: "Completed job not found" });

      if (r[0].customer_id && String(r[0].customer_id) !== String(customerId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      req.isPortal = true;      // bypass subscription middleware
      req.customerId = customerId;
      req.orgId = r[0].org_id;

      req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;
      return (jobsRouter as any)(req, res, next);
    } catch (e: any) {
      console.error("[portal service sheet]", e);
      return res.status(500).json({ error: e?.message || "Failed to generate PDF" });
    }
  }
);

export default portalRouter;
