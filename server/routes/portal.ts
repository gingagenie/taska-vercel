import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

// If you use Drizzle table objects, swap these sql queries to your schema.
// This is intentionally "drop-in" without needing your exact Drizzle tables.

const router = Router();

/** Customer portal session guard */
function requireCustomerAuth(req: any, res: any, next: any) {
  if (!req.session?.customerUserId || !req.session?.orgId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function getCustomerUser(req: any) {
  const orgId = req.session.orgId;
  const customerUserId = req.session.customerUserId;

  const rows = await db.execute(sql`
    select id, org_id, customer_id, email, name, disabled_at
    from customer_users
    where id = ${customerUserId}::uuid
      and org_id = ${orgId}::uuid
    limit 1
  `);

  const user = (rows as any).rows?.[0] || (rows as any)[0];
  return user || null;
}

/** Login (password) */
router.post("/portal/login", async (req: any, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // orgId must be known. If your portal is org-specific, you can:
    //  - set orgId via subdomain
    //  - set orgId via a portal code
    // For now: assume your existing session already has orgId OR you set it earlier.
    const orgId = req.session?.orgId;
    if (!orgId) return res.status(400).json({ error: "Missing org context" });

    const rows = await db.execute(sql`
      select id, org_id, customer_id, email, name, password_hash, disabled_at
      from customer_users
      where org_id = ${orgId}::uuid
        and lower(email) = lower(${email})
      limit 1
    `);

    const user = (rows as any).rows?.[0] || (rows as any)[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at) return res.status(403).json({ error: "Account disabled" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    req.session.customerUserId = user.id;

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, customer_id: user.customer_id },
    });
  } catch (e: any) {
    console.error("portal login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/portal/logout", (req: any, res) => {
  req.session.customerUserId = null;
  return res.json({ ok: true });
});

router.get("/portal/me", requireCustomerAuth, async (req: any, res) => {
  const user = await getCustomerUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    customer_id: user.customer_id,
  });
});

/**
 * Equipment list for this customer.
 * ASSUMPTION: you have an `equipment` table with `customer_id`.
 * Replace fields/table name to match your schema.
 */
router.get("/portal/equipment", requireCustomerAuth, async (req: any, res) => {
  const user = await getCustomerUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const rows = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
    order by created_at desc
  `);

  return res.json((rows as any).rows || rows);
});

/**
 * Equipment detail + completed job history.
 * ASSUMPTION: completed jobs reference equipment via completed_job_equipment join
 * OR direct equipment_id on completed_jobs.
 * We’ll support BOTH patterns below — keep the one you actually have.
 */
router.get("/portal/equipment/:equipmentId", requireCustomerAuth, async (req: any, res) => {
  const user = await getCustomerUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { equipmentId } = req.params;

  const eqRows = await db.execute(sql`
    select id, name, serial_number, asset_number, created_at
    from equipment
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
      and id = ${equipmentId}::uuid
    limit 1
  `);

  const equipment = (eqRows as any).rows?.[0] || (eqRows as any)[0];
  if (!equipment) return res.status(404).json({ error: "Equipment not found" });

  // OPTION 1: join table completed_job_equipment (equipment used)
  const jobRows = await db.execute(sql`
    select cj.id, cj.title, cj.completed_at
    from completed_jobs cj
    join completed_job_equipment cje on cje.completed_job_id = cj.id
    where cj.org_id = ${user.org_id}::uuid
      and cj.customer_id = ${user.customer_id}::uuid
      and cje.equipment_id = ${equipmentId}::uuid
    order by cj.completed_at desc
  `);

  // OPTION 2 (if you store equipment_id directly on completed_jobs), replace above with:
  // select id, title, completed_at from completed_jobs where org_id=... and customer_id=... and equipment_id=...

  return res.json({
    equipment,
    jobs: (jobRows as any).rows || jobRows,
  });
});

/**
 * Download service sheet PDF for a completed job (customer-scoped).
 * This MUST call your existing generator endpoint/logic.
 *
 * IMPORTANT: Do NOT allow arbitrary jobId — we enforce org + customer ownership.
 */
router.get("/portal/completed-jobs/:jobId/service-sheet", requireCustomerAuth, async (req: any, res) => {
  const user = await getCustomerUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { jobId } = req.params;
  const download = req.query.download === "1";

  // Ensure this completed job belongs to this customer
  const rows = await db.execute(sql`
    select id, title
    from completed_jobs
    where org_id = ${user.org_id}::uuid
      and customer_id = ${user.customer_id}::uuid
      and id = ${jobId}::uuid
    limit 1
  `);

  const job = (rows as any).rows?.[0] || (rows as any)[0];
  if (!job) return res.status(404).json({ error: "Job not found" });

  // Call your existing PDF generator function if you have it.
  // If your service-sheet route already exists, you can literally reuse its implementation.
  const pdfBuffer: Buffer = await generateServiceSheetPdfForCompletedJob({
    orgId: user.org_id,
    completedJobId: jobId,
  });

  if (!pdfBuffer || pdfBuffer.length === 0) {
    return res.status(500).json({ error: "PDF generation returned empty file" });
  }

  const filename = `service-sheet-${(job.title || jobId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(pdfBuffer.length));
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);

  return res.status(200).send(pdfBuffer);
});

export default router;

/**
 * You must implement or import this.
 * If you already have the working route:
 *   GET /api/jobs/completed/:id/service-sheet
 * then extract the generator into a shared function and call it from both.
 */
async function generateServiceSheetPdfForCompletedJob(args: { orgId: string; completedJobId: string }) {
  throw new Error(
    "generateServiceSheetPdfForCompletedJob not wired. Extract your existing PDF generator into a shared function and call it here."
  );
}
