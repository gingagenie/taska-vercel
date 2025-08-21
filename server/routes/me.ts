import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

export const me = Router();

// Get current user's profile
me.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  try {
    const r: any = await db.execute(
      sql`select id, email, name from users where id=${userId}::uuid`
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// Update profile (name/email/password)
me.post("/", requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  const { name, email, password } = req.body || {};

  if (!name && !email && !password) {
    return res.status(400).json({ error: "No changes provided" });
  }

  try {
    if (email) {
      // basic uniqueness guard
      const exists: any = await db.execute(
        sql`select 1 from users where email=${email} and id<>${userId}::uuid limit 1`
      );
      if (exists.rows?.length) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    // NOTE: if you have real hashing elsewhere, call it; we’re keeping this minimal here.
    await db.execute(sql`
      update users
      set
        name = coalesce(${name}, name),
        email = coalesce(${email}, email),
        password_hash = coalesce(${password}, password_hash)
      where id=${userId}::uuid
    `);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});
