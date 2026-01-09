// server/routes/portal.ts
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import jobsRouter from "./jobs";

const portalRouter = Router();

function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

function getPortalCustomerId(req: any): string | null {
  return (
    req?.session?.customerId ||          // ✅ real customers.id
    req?.session?.customer?.id ||
    null
  );
}

// ✅ Resolve orgId from slug so we can correctly scope all portal queries
async function getOrgIdBySlug(orgSlug: string): Promise<string | null> {
  const r: any = await db.execute(sql`
    SELECT id
    FROM orgs
    WHERE lower(slug) = lower(${orgSlug})
    LIMIT 1
  `);

  return r?.[0]?.id || null;
}

/**
 * ✅ Debug endpoint: tells you exactly what the server sees
 * GET /api/portal/:org/debug-session
 */
portalRouter.get("/portal/:org/debug-session", async (req: any, res) => {
  const orgSlug = req.params.org;
  const orgId = await getOrgIdBySlug(orgSlug);

  res.json({
    orgSlug,
    orgId,
    session: {
      customerId: req?.session?.customerId || null,
      portalCustomerId: req?.session?.portalCustomerId || null,
      customer: req?.session?.customer || null,
      isPortal: req?.session?.isPortal || null,
    },
    cookie: req.headers?.cookie || null,
  });
});

// --------------------------------------------------
// GET /api/portal/:org/equipment
// --------------------------------------------------
portalRouter.get("/portal/:org/equipment", async (req: any, res) => {
  try {
    const orgSlug = req.params.org;
    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number
      FROM equipment
      WHERE org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    res.json(r);
  } catch (e: any) {
    console.error("[portal equipment list]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// --------------------------------------------------
// GET /api/portal/:org/equipment/:id
// --------------------------------------------------
portalRouter.get("/portal/:org/equipment/:id", async (req: any, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid equipment id" });

  try {
    const orgSlug = req.params.org;
    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const equipmentRows: any = await db.execute(sql`
      SELECT *
      FROM equipment
      WHERE id = ${id}::uuid
        AND org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      LIMIT 1
    `);

    if (!equipmentRows?.length) return res.status(404).json({ error: "Equipment not found" });

    // optional: you might want jobs filtered to equipment, but keeping your current behaviour:
    const jobs: any = await db.execute(sql`
      SELECT cj.id, cj.title, cj.completed_at
      FROM completed_jobs cj
      WHERE cj.org_id = ${orgId}::uuid
        AND cj.customer_id = ${customerId}::uuid
      ORDER BY cj.completed_at DESC
    `);

    res.json({ equipment: equipmentRows[0], jobs });
  } catch (e: any) {
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: e?.message || "Failed to load equipment" });
  }
});

// --------------------------------------------------
// PORTAL SERVICE SHEET (reuses jobs router)
// GET /api/portal/:org/completed-jobs/:completedJobId/service-sheet
// --------------------------------------------------
portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!completedJobId || !isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const orgSlug = req.params.org;
    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const r: any = await db.execute(sql`
        SELECT org_id, customer_id
        FROM completed_jobs
        WHERE id = ${completedJobId}::uuid
          AND org_id = ${orgId}::uuid
        LIMIT 1
      `);

      if (!r?.length) return res.status(404).json({ error: "Completed job not found" });
      if (r[0].customer_id && String(r[0].customer_id) !== String(customerId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      req.isPortal = true;
      req.customerId = customerId;
      req.orgId = orgId;

      req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;
      return (jobsRouter as any)(req, res, next);
    } catch (e: any) {
      console.error("[portal service sheet]", e);
      res.status(500).json({ error: e?.message || "Failed to generate PDF" });
    }
  }
);

export default portalRouter;
