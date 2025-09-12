import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import bcrypt from "bcryptjs";

export const members = Router();
const isUuid = (v: string | undefined) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/* LIST MEMBERS */
members.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  try {
    // Get members with online status
    const r: any = await db.execute(sql`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.role, 
        u.color,
        CASE 
          WHEN s.user_id IS NOT NULL THEN true 
          ELSE false 
        END as is_online,
        COUNT(s.sid) as active_sessions,
        MAX(s.expire) as last_seen
      FROM users u
      LEFT JOIN (
        SELECT DISTINCT 
          (sess->>'userId')::uuid as user_id,
          sid,
          expire
        FROM session 
        WHERE expire > NOW()
      ) s ON u.id = s.user_id
      WHERE u.org_id = ${orgId}::uuid
      GROUP BY u.id, u.name, u.email, u.phone, u.role, u.color, s.user_id
      ORDER BY u.name ASC
    `);
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch members" });
  }
});

/* ADD MEMBER (creates login too) */
members.post("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  const { name, email, phone, role = "technician", color = "#3b82f6", password } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: "name and email required" });
  if (!password || password.length < 6) return res.status(400).json({ error: "password must be at least 6 chars" });

  try {
    const existing: any = await db.execute(sql`
      select 1 from users
      where org_id=${orgId}::uuid and lower(email)=lower(${email})
    `);
    if (existing?.length) return res.status(409).json({ error: "email already exists in this org" });

    const hash = await bcrypt.hash(password, 10);

    const ins: any = await db.execute(sql`
      insert into users (org_id, name, email, phone, role, color, password_hash)
      values (${orgId}::uuid, ${name}, ${email}, ${phone}, ${role}, ${color}, ${hash})
      returning id, name, email, role, color
    `);

    res.json({ ok: true, user: ins[0] });
  } catch (error: any) {
    console.error("POST /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to create member" });
  }
});

/* EDIT MEMBER */
members.put("/:memberId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { memberId } = req.params;
  const { name, email, phone, role, color } = req.body || {};
  if (!isUuid(memberId)) return res.status(400).json({ error: "Invalid memberId" });

  try {
    await db.execute(sql`
      update users
      set name  = coalesce(${name}, name),
          email = coalesce(${email}, email),
          phone = coalesce(${phone}, phone),
          role  = coalesce(${role}, role),
          color = coalesce(${color}, color)
      where id=${memberId} and org_id=${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to update member" });
  }
});

/* DELETE MEMBER */
members.delete("/:memberId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { memberId } = req.params;
  if (!isUuid(memberId)) return res.status(400).json({ error: "Invalid memberId" });

  try {
    await db.execute(sql`
      delete from users
      where id=${memberId} and org_id=${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete member" });
  }
});