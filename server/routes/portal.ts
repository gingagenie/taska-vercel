import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * Portal session guard
 * We store:
 *  - req.session.portalOrgId
 *  - req.session.portalCustomerUserId
 */
function requirePortalAuth(req: any, res: any, next: any) {
  if (!req.session?.portalOrgId || !req.session?.portalCustomerUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function getOrgIdFromSlug(orgSlug: string): Promise<string | null> {
  const rows = await db.execute(sql`
    select org_id
    from portal_orgs
    where slug = ${orgSlug}
    limit 1
  `);

  const row = (rows as any).rows?.[0] || (rows as any)[0];
  return row?.org_id || null;
}

async function getPortalUser(req: any) {
  const orgId = req.session.portalOrgId;
  const userId = req.session.portalCustomerUserId;

  const rows = await db.execute(sql`
    select id, org_id, customer_id, email, name, disabled_at
    from customer_users
    where id = ${userId}::uuid
      and org_id = ${orgId}::uuid
    limit 1
  `);

  const user = (rows as any).rows?.[0] || (rows as any)[0];
  return user || null;
}

/**
 * POST /api/portal/:org/login
 * Body: { email, password }
 *
 * Uses Postgres crypt() for password verification (no bcryptjs required).
 * Make sure you created extension pgcrypto in Supabase.
 */
router.post("/portal/:org/login", async (req: any, res) => {
  try {
    const { org } = req.params;
    const { email, password } = req.body || {};

    if (!org) return res.status(400).json({ error: "Missing org" });
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Resolve orgId from slug
    const orgRows = await db.execute(sql`
      select org_id
      from portal_orgs
      where slug = ${org}
      limit 1
    `);

    const orgRow = (orgRows as any).rows?.[0] || (orgRows as any)[0];
    if (!orgRow) return res.status(404).json({ error: "Portal not found" });

    const orgId = orgRow.org_id;

    // Find customer portal user
    const userRows = await db.execute(sql`
      select id, org_id, customer_id, email, name, password_hash, disabled_at
      from customer_users
      where org_id = ${orgId}::uuid
        and lower(email) = lower(${email})
      limit 1
    `);

    const user = (userRows as any).rows?.[0] || (userRows as any)[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at) return res.status(403).json({ error: "Account disabled" });

    // Password check (pgcrypto)
    const check = await db.execute(sql`
      select crypt(${password}, ${user.password_hash}) = ${user.password_hash} as ok
    `);

    const ok = (check as any).rows?.[0]?.ok;
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // ✅ SET SESSION
    req.session.portalOrgId = orgId;
    req.session.portalCustomerUserId = user.id;

    // ✅ FORCE SAVE SESSION
    return req.session.save((err: any) => {
      if (err) {
        console.error("portal session save error:", err);
        return res.status(500).json({ error: "Login failed" });
      }

      return res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          customer_id: user.customer_id,
        },
      });
    });
  } catch (e) {
    console.error("portal login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});


    const user = (rows as any).rows?.[0] || (rows as any)[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at) return res.status(403).json({ error: "Account disabled" });

    // ✅ Verify password using pgcrypto crypt()
    const check = await db.execute(sql`
      select crypt(${password}, ${user.password_hash}) = ${user.password_hash} as ok
    `);
    const ok = (check as any).rows?.[0]?.ok;

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // ✅ Set portal session
    req.session.portalOrgId = orgId;
    req.session.portalCustomerUserId = user.id;

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, customer_id: user.customer_id },
    });
  } catch (e: any) {
    console.error("portal login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/portal/:org/logout", (req: any, res) => {
  req.session.portalOrgId = null;
  req.session.portalCustomerUserId = null;
  return res.json({ ok: true });
});

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
 * Assumes equipment table has org_id + customer_id
 */
router.get("/portal/:org/equipment", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const rows = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
    order by created_at desc
  `);

  return res.json((rows as any).rows || rows);
});

/**
 * GET /api/portal/:org/equipment/:equipmentId
 * Uses completed_job_equipment join table.
 * If you DON'T have completed_job_equipment, tell me and I’ll swap to equipment_id on completed_jobs.
 */
router.get("/portal/:org/equipment/:equipmentId", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { equipmentId } = req.params;

  const eqRows = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
      and id = ${equipmentId}::uuid
    limit 1
  `);

  const equipment = (eqRows as any).rows?.[0] || (eqRows as any)[0];
  if (!equipment) return res.status(404).json({ error: "Equipment not found" });

  const jobRows = await db.execute(sql`
    select cj.id, cj.title, cj.completed_at
    from completed_jobs cj
    join completed_job_equipment cje on cje.completed_job_id = cj.id
    where cj.org_id = ${user.org_id}::uuid
      and cj.customer_id = ${user.customer_id}::uuid
      and cje.equipment_id = ${equipmentId}::uuid
    order by cj.completed_at desc
  `);

  return res.json({
    equipment,
    jobs: (jobRows as any).rows || jobRows,
  });
});

/**
 * GET /api/portal/:org/completed-jobs/:jobId/service-sheet?download=1
 * IMPORTANT: This is still a stub until we wire your existing working PDF generator.
 */
router.get("/portal/:org/completed-jobs/:jobId/service-sheet", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { jobId } = req.params;
  const download = req.query.download === "1";

  const rows = await db.execute(sql`
    select id, title
    from completed_jobs
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
      and id = ${jobId}::uuid
    limit 1
  `);

  const job = (rows as any).rows?.[0] || (rows as any)[0];
  if (!job) return res.status(404).json({ error: "Job not found" });

  // TODO: Wire your existing PDF generator here
  return res.status(501).json({
    error:
      "PDF not wired for portal yet. Wire existing completed job service-sheet generator into portal route.",
  });

  // When wired, you will return the PDF buffer with headers similar to your existing endpoint.
});

export default router;
