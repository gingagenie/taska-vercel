import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const router = Router();

/** Portal auth guard */
function requirePortalAuth(req: any, res: any, next: any) {
  if (!req.session?.portalOrgId || !req.session?.portalCustomerUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function firstRow(result: any) {
  return result?.rows?.[0] ?? result?.[0] ?? null;
}

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
 */
router.post("/portal/:org/login", async (req: any, res) => {
  try {
    const orgSlug = req.params.org;
    const { email, password } = req.body || {};

    if (!orgSlug) return res.status(400).json({ error: "Missing org" });
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const orgId = await getOrgIdFromSlug(orgSlug);
    if (!orgId) return res.status(404).json({ error: "Portal not found" });

    const userResult = await db.execute(sql`
      select id, org_id, customer_id, email, name, password_hash, disabled_at
      from customer_users
      where org_id = ${orgId}::uuid
        and lower(email) = lower(${email})
      limit 1
    `);

    const user = firstRow(userResult);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at) return res.status(403).json({ error: "Account disabled" });

    const checkResult = await db.execute(sql`
      select (crypt(${password}, ${user.password_hash}) = ${user.password_hash}) as ok
    `);

    const checkRow = firstRow(checkResult);
    const okRaw = checkRow?.ok;
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

  // save best-effort
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

/** GET /api/portal/:org/equipment */
router.get("/portal/:org/equipment", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const r = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
    order by created_at desc
  `);

  return res.json((r as any).rows ?? r);
});

/** GET /api/portal/:org/equipment/:equipmentId */
router.get("/portal/:org/equipment/:equipmentId", requirePortalAuth, async (req: any, res) => {
  const user = await getPortalUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { equipmentId } = req.params;

  const eqRes = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
      and id = ${equipmentId}::uuid
    limit 1
  `);

  const equipment = firstRow(eqRes);
  if (!equipment) return res.status(404).json({ error: "Equipment not found" });

  const jobsRes = await db.execute(sql`
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
    jobs: (jobsRes as any).rows ?? jobsRes,
  });
});

export default router;
