import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

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

// POST / - create new member (existing functionality preserved)
members.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { email, name, role = "technician", phone } = req.body || {};
  
  console.log("[TRACE] POST /api/members org=%s", orgId);
  
  if (!email?.trim()) {
    return res.status(400).json({ error: "email required" });
  }
  
  try {
    // Check if user exists
    const existing: any = await db.execute(sql`
      select id, name, email, role from users 
      where email=${email} and org_id=${orgId}::uuid
    `);
    
    if (existing.rows.length > 0) {
      // Update existing user
      await db.execute(sql`
        update users 
        set name = coalesce(${name}, name),
            role = coalesce(${role}, role),
            phone = coalesce(${phone}, phone)
        where email=${email} and org_id=${orgId}::uuid
      `);
      
      const updated: any = await db.execute(sql`
        select id, name, email, role, phone from users 
        where email=${email} and org_id=${orgId}::uuid
      `);
      
      res.json(updated.rows[0]);
    } else {
      // Create new user
      const result: any = await db.execute(sql`
        insert into users (org_id, email, name, role, phone)
        values (${orgId}::uuid, ${email}, ${name || email.split('@')[0]}, ${role}, ${phone})
        returning id, name, email, role, phone
      `);
      
      res.json(result.rows[0]);
    }
  } catch (error: any) {
    console.error("POST /api/members error:", error);
    res.status(500).json({ error: error?.message || "Failed to create/update member" });
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