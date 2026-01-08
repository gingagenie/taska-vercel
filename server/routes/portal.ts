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

// --------------------------------------------------
// PORTAL: equipment list / detail routes
// (these already existed in your app — kept intact)
// --------------------------------------------------

// example: GET /api/portal/:org/equipment
portalRouter.get("/portal/:org/equipment", async (req, res) => {
  try {
    const customerId =
      req.session?.portalCustomerId ||
      req.session?.customerId ||
      req.session?.customer?.id ||
      null;

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

// example: GET /api/portal/:org/equipment/:id
portalRouter.get("/portal/:org/equipment/:id", async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid equipment id" });
  }

  try {
    const customerId =
      req.session?.portalCustomerId ||
      req.session?.customerId ||
      req.session?.customer?.id ||
      null;

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
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// --------------------------------------------------
// ✅ PORTAL SERVICE SHEET (THIS IS THE FIX)
// --------------------------------------------------
// GET /api/portal/:org/completed-jobs/:completedJobId/service-sheet
// Reuses the EXISTING /api/jobs/completed/:id/service-sheet logic
// --------------------------------------------------

portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;

    if (!completedJobId || !isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    // portal session markers
    const customerId =
      req.session?.portalCustomerId ||
      req.session?.customerId ||
      req.session?.customer?.id ||
      req.session?.portal?.customerId ||
      req.session?.portal?.customer?.id ||
      null;

    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
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

      // 👇 CRITICAL FLAGS
      req.isPortal = true;          // bypass subscription
      req.customerId = customerId;
      req.orgId = r[0].org_id;

      // 👇 forward into the EXISTING jobs router
      req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;

      return (jobsRouter as any)(req, res, next);
    } catch (e: any) {
      console.error("[portal service sheet]", e);
      res.status(500).json({ error: e?.message || "Failed to generate PDF" });
    }
  }
);

export default portalRouter;
