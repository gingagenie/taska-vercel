import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

const router = Router();

/* ---------------------------------------------------------------
   POST /api/admin/push-tokens
   Register a device token for admin push notifications.
--------------------------------------------------------------- */
router.post("/push-tokens", requireAuth, requireAdmin, async (req, res) => {
  const adminUserId = (req as any).adminUser?.id;
  const { deviceToken, platform } = req.body as { deviceToken?: string; platform?: string };

  if (!deviceToken) {
    return res.status(400).json({ error: "deviceToken is required" });
  }

  const p = platform === "ios" ? "ios" : "android";

  try {
    await db.execute(sql`
      INSERT INTO admin_push_tokens (admin_user_id, device_token, platform)
      VALUES (${adminUserId}::uuid, ${deviceToken}, ${p})
      ON CONFLICT (device_token) DO UPDATE
        SET admin_user_id = EXCLUDED.admin_user_id,
            platform = EXCLUDED.platform
    `);
    console.log(`[PUSH TOKENS] Registered ${p} token for admin ${adminUserId}`);
    return res.json({ success: true });
  } catch (e: any) {
    console.error("[PUSH TOKENS] Register error:", e);
    return res.status(500).json({ error: "Failed to register push token" });
  }
});

/* ---------------------------------------------------------------
   DELETE /api/admin/push-tokens
   Remove a device token (e.g. on logout).
--------------------------------------------------------------- */
router.delete("/push-tokens", requireAuth, requireAdmin, async (req, res) => {
  const { deviceToken } = req.body as { deviceToken?: string };

  if (!deviceToken) {
    return res.status(400).json({ error: "deviceToken is required" });
  }

  try {
    await db.execute(sql`
      DELETE FROM admin_push_tokens WHERE device_token = ${deviceToken}
    `);
    return res.json({ success: true });
  } catch (e: any) {
    console.error("[PUSH TOKENS] Delete error:", e);
    return res.status(500).json({ error: "Failed to delete push token" });
  }
});

export default router;
