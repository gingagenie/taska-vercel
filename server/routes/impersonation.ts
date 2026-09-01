import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

const router = Router();

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/* ---------------------------------------------------------------
   POST /api/admin/customers/:id/impersonate
   Generate a one-time portal impersonation token for a customer.
--------------------------------------------------------------- */
router.post("/customers/:id/impersonate", requireAuth, requireAdmin, async (req, res) => {
  const { id: customerId } = req.params;
  const adminUserId = (req as any).adminUser?.id;

  if (!isUuid(customerId)) {
    return res.status(400).json({ error: "Invalid customer id" });
  }

  try {
    // Look up customer
    const customerRows: any = await db.execute(sql`
      SELECT id, name, org_id FROM customers WHERE id = ${customerId}::uuid LIMIT 1
    `);
    if (!customerRows?.length) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const customer = customerRows[0];

    // Get org slug
    const orgRows: any = await db.execute(sql`
      SELECT slug FROM orgs WHERE id = ${customer.org_id}::uuid LIMIT 1
    `);
    if (!orgRows?.length) {
      return res.status(404).json({ error: "Organisation not found" });
    }
    const orgSlug: string = orgRows[0].slug;

    // Generate one-time token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 min

    await db.execute(sql`
      INSERT INTO admin_impersonation_tokens (token_hash, customer_id, org_id, admin_user_id, expires_at)
      VALUES (${tokenHash}, ${customerId}::uuid, ${customer.org_id}::uuid, ${adminUserId}::uuid, ${expiresAt.toISOString()})
    `);

    // Audit log
    await db.execute(sql`
      INSERT INTO admin_impersonation_log (admin_user_id, customer_id, customer_name)
      VALUES (${adminUserId}::uuid, ${customerId}::uuid, ${customer.name})
    `);

    const portalUrl = `/portal/${orgSlug}/login?impersonateToken=${rawToken}`;

    console.log(`[IMPERSONATE] Admin ${adminUserId} impersonating customer ${customerId} (${customer.name})`);

    return res.json({
      token: rawToken,
      portalUrl,
      customerName: customer.name,
      orgSlug,
    });
  } catch (e: any) {
    console.error("[IMPERSONATE] Error:", e);
    return res.status(500).json({ error: "Failed to create impersonation token" });
  }
});

/* ---------------------------------------------------------------
   GET /api/admin/orgs/:orgId/customers
   List customers for an org (used by admin portal-customers page).
--------------------------------------------------------------- */
router.get("/orgs/:orgId/customers", requireAuth, requireAdmin, async (req, res) => {
  const { orgId } = req.params;
  if (!isUuid(orgId)) {
    return res.status(400).json({ error: "Invalid org id" });
  }
  try {
    const rows: any = await db.execute(sql`
      SELECT id, name, email, phone
      FROM customers
      WHERE org_id = ${orgId}::uuid
      ORDER BY name ASC
    `);
    return res.json(rows);
  } catch (e: any) {
    console.error("[ADMIN customers] Error:", e);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

export default router;
