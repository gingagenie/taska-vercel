// server/routes/godmode.ts
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router = Router();

// Simple password check middleware
function requireGodMode(req: any, res: any, next: any) {
  if (req.session?.godmode === true) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

// POST /api/godmode/login
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const expected = process.env.GODMODE_PASSWORD;

  if (!expected) return res.status(500).json({ error: "GODMODE_PASSWORD not configured" });
  if (!password || password !== expected) {
    return res.status(401).json({ error: "Invalid password" });
  }

  req.session.godmode = true;
req.session.save((err) => {
  if (err) return res.status(500).json({ error: "Session save failed" });
  res.json({ ok: true });
});

// POST /api/godmode/logout
router.post("/logout", (req, res) => {
  req.session.godmode = false;
  res.json({ ok: true });
});

// GET /api/godmode/orgs
router.get("/orgs", requireGodMode, async (req, res) => {
  try {
    const orgs = await db.execute(sql`
      SELECT
        o.id,
        o.name,
        o.slug,
        o.created_at,
        o.trial_expires_at,
        o.disabled,
        COUNT(u.id)::int as user_count,
        MIN(u.email) as owner_email
      FROM orgs o
      LEFT JOIN users u ON u.org_id = o.id
      GROUP BY o.id, o.name, o.slug, o.created_at, o.trial_expires_at, o.disabled
      ORDER BY o.created_at DESC
    `);
    res.json(orgs);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to list orgs" });
  }
});

// POST /api/godmode/orgs — create org + admin user
router.post("/orgs", requireGodMode, async (req, res) => {
  const { org_name, email, password, trial_days = 30 } = req.body;
  if (!org_name || !email || !password) {
    return res.status(400).json({ error: "org_name, email and password are required" });
  }

  try {
    const existing: any = await db.execute(sql`SELECT id FROM users WHERE email = ${email}`);
    if (existing.length > 0) return res.status(400).json({ error: "Email already in use" });

    const slug = org_name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const password_hash = await bcrypt.hash(password, 10);
    const trial_expires_at = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000);

    const orgResult: any = await db.execute(sql`
      INSERT INTO orgs (id, name, slug, trial_expires_at, created_at)
      VALUES (gen_random_uuid(), ${org_name}, ${slug}, ${trial_expires_at}, NOW())
      RETURNING id, name, slug, trial_expires_at
    `);
    const org = orgResult[0];

    const userResult: any = await db.execute(sql`
      INSERT INTO users (id, org_id, name, email, password_hash, role, created_at)
      VALUES (gen_random_uuid(), ${org.id}, ${email}, ${email}, ${password_hash}, 'admin', NOW())
      RETURNING id, email, role
    `);
    const user = userResult[0];

    res.status(201).json({ org, user });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to create org" });
  }
});

// PATCH /api/godmode/orgs/:id/trial
router.patch("/orgs/:id/trial", requireGodMode, async (req, res) => {
  const { id } = req.params;
  const { trial_days } = req.body;
  if (!trial_days || trial_days < 1) return res.status(400).json({ error: "trial_days required" });

  try {
    const trial_expires_at = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000);
    await db.execute(sql`UPDATE orgs SET trial_expires_at = ${trial_expires_at} WHERE id = ${id}::uuid`);
    res.json({ ok: true, trial_expires_at });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update trial" });
  }
});

// PATCH /api/godmode/orgs/:id/disable
router.patch("/orgs/:id/disable", requireGodMode, async (req, res) => {
  const { id } = req.params;
  const { disabled } = req.body;

  try {
    await db.execute(sql`UPDATE orgs SET disabled = ${disabled} WHERE id = ${id}::uuid`);
    res.json({ ok: true, disabled });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update org" });
  }
});

// PATCH /api/godmode/orgs/:id/reset-password
router.patch("/orgs/:id/reset-password", requireGodMode, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "password required" });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    await db.execute(sql`
      UPDATE users SET password_hash = ${password_hash}
      WHERE org_id = ${id}::uuid
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to reset password" });
  }
});

export default router;
