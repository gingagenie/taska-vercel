
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const router = Router();

/** Helper: handle db.execute returning either {rows:[...]} or [...] */
function rowsOf(result: any) {
  return result?.rows ?? result ?? [];
}
function firstRow(result: any) {
  const r = rowsOf(result);
  return r?.[0] ?? null;
}

/** Session guard for portal routes */
function requirePortalAuth(req: any, res: any, next: any) {
  if (!req.session?.portalOrgId || !req.session?.portalCustomerUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

/** Resolve portal org slug -> org_id */
async function getOrgIdFromSlug(orgSlug: string): Promise<string | null> {
  const r = await db.execute(sql`
    select org_id
    from portal_orgs
    where slug = ${orgSlug}
    limit 1
  `);
  const row = firstRow(r);
  return row?.org_id ?? null;
}

/** Load portal user from session */
async function getPortalUser(req: any) {
  const orgId = req.session.portalOrgId;
  const userId = req.session.portalCustomerUserId;

  const r = await db.execute(sql`
    select id, org_id, customer_id, email, name, disabled_at
    from customer_users
    where id = ${userId}::uuid
      and org_id = ${orgId}::uuid
    limit 1
  `);

  return firstRow(r);
}

/**
 * POST /api/portal/:org/login
 * Body: { email, password }
 *
 * Uses pgcrypto crypt() for verification.
 */
router.post("/portal/:org/login", async (req: any, res) => {
  try {
    const orgSlug = req.params.org;
    const { email, password } = req.body || {};

    if (!orgSlug) return res.status(400).json({ error: "Missing org" });
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // Resolve org slug -> org_id
    const orgId = await getOrgIdFromSlug(orgSlug);
    if (!orgId) return res.status(404).json({ error: "Portal not found" });

    // Find portal user under that org
    const userRes = await db.execute(sql`
      select id, org_id, customer_id, email, name, password_hash, disabled_at
      from customer_users
      where org_id = ${orgId}::uuid
        and lower(email) = lower(${email})
      limit 1
    `);

    const user = firstRow(userRes);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at) return res.status(403).json({ error: "Account disabled" });

    // Password check (pgcrypto)
    const checkRes = await db.execute(sql`
      select (crypt(${password}, ${user.password_hash}) = ${user.password_hash}) as ok
    `);

    const check = firstRow(checkRes);
    const okRaw = check?.ok;
    const ok = okRaw === true || okRaw === "t" || okRaw === 1;

    console.log("[PORTAL LOGIN]", {
      orgSlug,
      orgId,
      email: String(email).toLowerCase(),
      userId: user.id,
      okRaw,
      ok,
    });

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // Save session
    req.session.portalOrgId = orgId;
    req.session.portalCustomerUserId = user.id;

    return req.session.save((err: any) => {
      if (err) {
        console.error("portal session save error:", err);
        return res.status(500).json({ error: "Login failed" });
      }

      return res.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, customer_id: user.customer_id },
      });
    });
  } catch (e: any) {
    console.error("portal login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

/** POST /api/portal/:org/logout */
router.post("/portal/:org/logout", (req: any, res) => {
  req.session.portalOrgId = null;
  req.session.portalCustomerUserId = null;
  req.session.save?.(() => {});
  return res.json({ ok: true });
});

/** GET /api/portal/:org/me */
router.get("/portal/:org/me", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    customer_id: user.customer_id,
  });
});

/**
 * GET /api/portal/:org/equipment
 * Uses your actual schema: equipment.customer_id + equipment.org_id
 * Columns: id, org_id, name, make, model, serial_number, created_at...
 */
router.get("/portal/:org/equipment", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const orgId = req.session.portalOrgId;
  const customerId = user.customer_id;

  const r = await db.execute(sql`
    select id, name, make, model, serial_number, created_at, updated_at, next_service_date, last_service_date
    from equipment
    where org_id = ${orgId}::uuid
      and customer_id = ${customerId}::uuid
    order by created_at desc
  `);

  return res.json(rowsOf(r));
});

/**
 * GET /api/portal/:org/equipment/:equipmentId
 * Returns equipment + completed job history for this equipment.
 */
router.get("/portal/:org/equipment/:equipmentId", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const orgId = req.session.portalOrgId;
  const customerId = user.customer_id;
  const { equipmentId } = req.params;

  const eqRes = await db.execute(sql`
    select id, name, make, model, serial_number, notes, created_at, updated_at,
           service_interval_months, last_service_date, next_service_date
    from equipment
    where org_id = ${orgId}::uuid
      and customer_id = ${customerId}::uuid
      and id = ${equipmentId}::uuid
    limit 1
  `);

  const equipment = firstRow(eqRes);
  if (!equipment) return res.status(404).json({ error: "Equipment not found" });

  // Job history via join table (as you’ve been using)
  const jobsRes = await db.execute(sql`
    select cj.id, cj.title, cj.completed_at
    from completed_jobs cj
    join completed_job_equipment cje on cje.completed_job_id = cj.id
    where cj.org_id = ${orgId}::uuid
      and cj.customer_id = ${customerId}::uuid
      and cje.equipment_id = ${equipmentId}::uuid
    order by cj.completed_at desc
  `);

  return res.json({
    equipment,
    jobs: rowsOf(jobsRes),
  });
});

/**
 * GET /api/portal/:org/completed-jobs/:jobId/service-sheet?download=1
 * IMPORTANT: you must wire this to your existing PDF generator.
 *
 * For now this endpoint enforces ownership and returns a helpful 501.
 */
router.get("/portal/:org/completed-jobs/:jobId/service-sheet", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const orgId = req.session.portalOrgId;
  const customerId = user.customer_id;
  const { jobId } = req.params;

  const jobRes = await db.execute(sql`
    select id, title
    from completed_jobs
    where org_id = ${orgId}::uuid
      and customer_id = ${customerId}::uuid
      and id = ${jobId}::uuid
    limit 1
  `);

  const job = firstRow(jobRes);
  if (!job) return res.status(404).json({ error: "Job not found" });

  // TODO: wire to your existing generator used by /api/jobs/completed/:id/service-sheet
  return res.status(501).json({
    error: "Portal PDF not wired yet. Reuse the existing completed-job service-sheet generator here.",
  });
});

export default router;
