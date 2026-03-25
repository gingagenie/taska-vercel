import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router = Router();

/* ── Auth middleware ─────────────────────────────────────────────────── */

function requireGodmode(req: any, res: any, next: any) {
  const password = process.env.GODMODE_PASSWORD;
  if (!password) {
    return res.status(503).json({ error: "GODMODE_PASSWORD not configured" });
  }
  const provided = req.headers["x-godmode-password"] as string | undefined;
  if (!provided || provided !== password) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ── Auth check ──────────────────────────────────────────────────────── */

router.post("/auth", (req, res) => {
  const password = process.env.GODMODE_PASSWORD;
  if (!password) {
    return res.status(503).json({ error: "GODMODE_PASSWORD not configured" });
  }
  const { password: provided } = req.body;
  if (provided === password) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Wrong password" });
});

/* ── List orgs ───────────────────────────────────────────────────────── */

router.get("/orgs", requireGodmode, async (_req, res) => {
  try {
    const orgs = await db.execute(sql`
      SELECT
        o.id,
        o.name,
        o.slug,
        o.created_at,
        o.trial_expires_at,
        o.disabled,
        COUNT(u.id)::int AS user_count,
        MIN(u.email) AS owner_email
      FROM orgs o
      LEFT JOIN users u ON u.org_id = o.id
      GROUP BY o.id, o.name, o.slug, o.created_at, o.trial_expires_at, o.disabled
      ORDER BY o.created_at DESC
    `);
    res.json(orgs);
  } catch (error) {
    console.error("[GODMODE] Error listing orgs:", error);
    res.status(500).json({ error: "Failed to list orgs" });
  }
});

/* ── Create org + user ───────────────────────────────────────────────── */

router.post("/orgs", requireGodmode, async (req, res) => {
  const { org_name, slug, email, password, trial_days = 30 } = req.body;

  if (!org_name || !email || !password) {
    return res.status(400).json({ error: "org_name, email, and password are required" });
  }

  try {
    const existing = await db.execute(sql`SELECT id FROM users WHERE email = ${email}`);
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const orgSlug =
      slug ||
      org_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    const password_hash = await bcrypt.hash(password, 10);
    const trial_expires_at = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000);

    const orgResult = await db.execute(sql`
      INSERT INTO orgs (id, name, slug, trial_expires_at, created_at)
      VALUES (gen_random_uuid(), ${org_name}, ${orgSlug}, ${trial_expires_at}, NOW())
      RETURNING id, name, slug, trial_expires_at
    `);
    const org = (orgResult as any[])[0];

    const userResult = await db.execute(sql`
      INSERT INTO users (id, org_id, name, email, password_hash, role, created_at)
      VALUES (gen_random_uuid(), ${org.id}, ${email}, ${email}, ${password_hash}, 'admin', NOW())
      RETURNING id, email, role
    `);
    const user = (userResult as any[])[0];

    console.log(`[GODMODE] Created org "${org_name}" (${org.id}) with user ${email}`);
    res.status(201).json({ org, user });
  } catch (error) {
    console.error("[GODMODE] Error creating org:", error);
    res
      .status(500)
      .json({ error: "Failed to create org", detail: error instanceof Error ? error.message : error });
  }
});

/* ── Set/extend trial ────────────────────────────────────────────────── */

router.patch("/orgs/:id/trial", requireGodmode, async (req, res) => {
  const { id } = req.params;
  const { trial_days } = req.body;

  if (!trial_days || trial_days < 1) {
    return res.status(400).json({ error: "trial_days must be a positive number" });
  }

  try {
    const trial_expires_at = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000);
    await db.execute(sql`UPDATE orgs SET trial_expires_at = ${trial_expires_at} WHERE id = ${id}`);
    res.json({ success: true, trial_expires_at });
  } catch (error) {
    console.error("[GODMODE] Error updating trial:", error);
    res.status(500).json({ error: "Failed to update trial" });
  }
});

/* ── Disable / enable org ────────────────────────────────────────────── */

router.patch("/orgs/:id/disable", requireGodmode, async (req, res) => {
  const { id } = req.params;
  const { disabled } = req.body;

  try {
    await db.execute(sql`UPDATE orgs SET disabled = ${disabled} WHERE id = ${id}`);
    res.json({ success: true, disabled });
  } catch (error) {
    console.error("[GODMODE] Error toggling org disabled state:", error);
    res.status(500).json({ error: "Failed to update org" });
  }
});

/* ── Reset a user's password ─────────────────────────────────────────── */

router.patch("/orgs/:id/reset-password", requireGodmode, async (req, res) => {
  const { id } = req.params;
  const { email, new_password } = req.body;

  if (!email || !new_password) {
    return res.status(400).json({ error: "email and new_password are required" });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const password_hash = await bcrypt.hash(new_password, 10);
    const result = await db.execute(sql`
      UPDATE users
      SET password_hash = ${password_hash}
      WHERE org_id = ${id} AND email = ${email}
      RETURNING id
    `);
    if ((result as any[]).length === 0) {
      return res.status(404).json({ error: "User not found in that org" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[GODMODE] Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

/* ── Delete org ──────────────────────────────────────────────────────── */

router.delete("/orgs/:id", requireGodmode, async (req, res) => {
  const { id } = req.params;

  try {
    // Null out FK references to users before deleting them
    await db.execute(sql`UPDATE completed_jobs SET completed_by = NULL, original_created_by = NULL WHERE org_id = ${id}`);
    await db.execute(sql`UPDATE jobs SET created_by = NULL WHERE org_id = ${id}`);
    await db.execute(sql`UPDATE media SET created_by = NULL WHERE org_id = ${id}`);

    // Delete in FK-safe order, all filtered by org_id
    await db.execute(sql`DELETE FROM job_notifications WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_assignments WHERE job_id IN (SELECT id FROM jobs WHERE org_id = ${id})`);
    await db.execute(sql`DELETE FROM job_hours WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_parts WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_charges WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_notes WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_photos WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM job_equipment WHERE job_id IN (SELECT id FROM jobs WHERE org_id = ${id})`);
    await db.execute(sql`DELETE FROM jobs WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_photos WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_equipment WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_parts WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_notes WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_hours WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_job_charges WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM completed_jobs WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM invoice_lines WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM invoices WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM quote_lines WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM quotes WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM equipment WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM customers WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM org_integrations WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM org_subscriptions WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM memberships WHERE org_id = ${id}`);
    await db.execute(sql`DELETE FROM notification_history WHERE user_id IN (SELECT id FROM users WHERE org_id = ${id})`);
    await db.execute(sql`UPDATE support_tickets SET submitted_by = NULL WHERE submitted_by IN (SELECT id FROM users WHERE org_id = ${id})`);
    await db.execute(sql`DELETE FROM users WHERE org_id = ${id}`);
    const result = await db.execute(sql`DELETE FROM orgs WHERE id = ${id} RETURNING id`);
    if ((result as any[]).length === 0) {
      return res.status(404).json({ error: "Org not found" });
    }
    console.log(`[GODMODE] Deleted org ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("[GODMODE] Error deleting org:", error);
    res.status(500).json({ error: "Failed to delete org", detail: error instanceof Error ? error.message : error });
  }
});

export default router;
