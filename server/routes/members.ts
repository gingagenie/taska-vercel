import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import bcrypt from "bcryptjs";

export const members = Router();

// GET / - list all members in organization
members.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/members org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select id, name, email, role
      from users
      where org_id=${orgId}::uuid
      order by name asc
    `);
    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch members" });
  }
});

// PUT /:memberId - update member (name/email/role)
members.put("/:memberId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { memberId } = req.params;
  const { name, email, role } = req.body || {};
  
  console.log("[TRACE] PUT /api/members/%s org=%s", memberId, orgId);
  
  try {
    await db.execute(sql`
      update users
        set name = coalesce(${name}, name),
            email = coalesce(${email}, email),
            role  = coalesce(${role}, role)
      where id=${memberId}::uuid and org_id=${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/members/%s error:", memberId, error);
    res.status(500).json({ error: error?.message || "Failed to update member" });
  }
});

// POST / - create member + login (password)
members.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { name, email, role = "technician", password } = req.body || {};
  
  console.log("[TRACE] POST /api/members org=%s", orgId);
  
  if (!email || !name) {
    return res.status(400).json({ error: "name and email required" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 chars" });
  }

  try {
    // Check if user exists in this org
    const existing: any = await db.execute(sql`
      select 1 from users where org_id=${orgId}::uuid and lower(email)=lower(${email})
    `);
    if (existing.rows?.length) {
      return res.status(409).json({ error: "email already exists in this org" });
    }

    const hash = await bcrypt.hash(password, 10);

    const ins: any = await db.execute(sql`
      insert into users (org_id, name, email, role, password_hash)
      values (${orgId}::uuid, ${name}, ${email}, ${role}, ${hash})
      returning id, name, email, role
    `);

    res.json({ ok: true, user: ins.rows[0] });
  } catch (error: any) {
    console.error("POST /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to create member" });
  }
});

// DELETE /:memberId - remove member
members.delete("/:memberId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { memberId } = req.params;
  
  console.log("[TRACE] DELETE /api/members/%s org=%s", memberId, orgId);
  
  try {
    await db.execute(sql`
      delete from users 
      where id=${memberId}::uuid and org_id=${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/members/%s error:", memberId, error);
    res.status(500).json({ error: error?.message || "Failed to delete member" });
  }
});