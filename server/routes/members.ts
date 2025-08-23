import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const ALLOWED_ROLES = new Set(["technician", "manager", "admin"]);

const members = Router();

/** List org members */
members.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  try {
    const r: any = await db.execute(sql`
      select id, email, name, role, phone, avatar_url, created_at
      from users
      where org_id=${orgId}::uuid
      order by created_at desc, id desc
    `);
    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch members" });
  }
});

/** Create/Upsert member (by org_id + lower(email)) with role guard */
members.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  let { email, name, role, phone } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  try {
    email = String(email).trim();
    const emailLC = email.toLowerCase();
    const roleNorm = ALLOWED_ROLES.has(String(role)) ? String(role) : "technician";

    const existing: any = await db.execute(sql`
      select id from users where org_id=${orgId}::uuid and lower(email)=${emailLC}
    `);

    if (existing.rows?.[0]?.id) {
      const id = existing.rows[0].id;
      await db.execute(sql`
        update users set
          name  = coalesce(${name}, name),
          role  = ${roleNorm},
          phone = coalesce(${phone}, phone),
          email = ${email}
        where id=${id}::uuid
      `);
      const row: any = await db.execute(sql`
        select id, email, name, role, phone, avatar_url, created_at
        from users where id=${id}::uuid
      `);
      return res.json({ ok: true, created: false, user: row.rows[0] });
    }

    const ins: any = await db.execute(sql`
      insert into users (org_id, email, name, role, phone)
      values (${orgId}::uuid, ${email}, ${name || null}, ${roleNorm}, ${phone || null})
      returning id
    `);
    const row: any = await db.execute(sql`
      select id, email, name, role, phone, avatar_url, created_at
      from users where id=${ins.rows[0].id}::uuid
    `);
    res.json({ ok: true, created: true, user: row.rows[0] });
  } catch (error: any) {
    console.error("POST /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to create member" });
  }
});

/** Delete member (only within same org, and safe if team links exist) */
members.delete("/:userId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { userId } = req.params;
  if (!isUuid(userId)) return res.status(400).json({ error: "invalid userId" });

  try {
    // Optional: prevent self-delete; comment out if you want to allow
    // if ((req as any).user.id === userId) return res.status(400).json({ error: "cannot delete yourself" });

    // Remove from team_members first
    await db.execute(sql`delete from team_members where user_id=${userId}::uuid`);
    // Delete user (scoped to org)
    await db.execute(sql`delete from users where id=${userId}::uuid and org_id=${orgId}::uuid`);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete member" });
  }
});

/** Compat: add to team by email (optional legacy) */
members.post("/_compat/teams-add-member", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  let { email, name, teamId, role, phone } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  if (!isUuid(teamId)) return res.status(400).json({ error: "invalid teamId" });

  try {
    email = String(email).trim();
    const emailLC = email.toLowerCase();
    const roleNorm = ALLOWED_ROLES.has(String(role)) ? String(role) : "technician";

    const existing: any = await db.execute(sql`
      select id from users where org_id=${orgId}::uuid and lower(email)=${emailLC}
    `);

    let userId: string;
    if (existing.rows?.[0]?.id) {
      userId = existing.rows[0].id;
      await db.execute(sql`
        update users set
          name  = coalesce(${name}, name),
          role  = ${roleNorm},
          phone = coalesce(${phone}, phone),
          email = ${email}
        where id=${userId}::uuid
      `);
    } else {
      const ins: any = await db.execute(sql`
        insert into users (org_id, email, name, role, phone)
        values (${orgId}::uuid, ${email}, ${name || null}, ${roleNorm}, ${phone || null})
        returning id
      `);
      userId = ins.rows[0].id;
    }

    await db.execute(sql`
      insert into team_members (team_id, user_id)
      values (${teamId}::uuid, ${userId}::uuid)
      on conflict do nothing
    `);

    res.json({ ok: true, userId });
  } catch (error: any) {
    console.error("POST /api/members/_compat/teams-add-member error:", error);
    res.status(500).json({ error: error?.message || "Failed to add member to team" });
  }
});

export default members;