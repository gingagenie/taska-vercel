import { Router } from "express";
import { db } from "../db";
import { jobs as jobsSchema, customers, equipment, jobPhotos } from "../../shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { sql, eq, and } from "drizzle-orm";

export const jobs = Router();

// UUID validation helper
function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

// Timezone-aware scheduled_at normalization
function normalizeScheduledAt(raw: any): string|null {
  if (!raw) return null;
  // If client already sent ISO with Z, pass it through
  if (typeof raw === "string" && /Z$/.test(raw)) return raw;
  // If it looks like "YYYY-MM-DDTHH:mm" (datetime-local), treat as local AEST and convert to UTC
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw); // local
    if (!isNaN(d.valueOf())) return d.toISOString();
  }
  // Fallback: let Postgres parse; but ensure timestamptz column
  return raw;
}

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Add ping endpoint for health check
jobs.get("/ping", (_req, res) => {
  console.log("[TRACE] GET /api/jobs/ping");
  res.json({ ok: true });
});

// GET /api/jobs/equipment?customerId=uuid - Filter equipment by customer for job creation
jobs.get("/equipment", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const customerId = (req.query.customerId as string | undefined) || undefined;

  const r: any = await db.execute(sql`
    select id, name
    from equipment
    where org_id=${orgId}::uuid
      ${customerId ? sql`and customer_id=${customerId}::uuid` : sql``}
    order by name asc
  `);
  res.json(r.rows);
});

/* LIST (now includes description) */
jobs.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select
        j.id,
        j.title,
        j.description,             -- added
        j.status,
        to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
        j.customer_id,
        coalesce(c.name,'—') as customer_name
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.org_id=${orgId}::uuid
      order by j.created_at desc
    `);
    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/jobs error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

// --- TECH FILTER SOURCE ---
// Return technicians in this org (id + name). Using mock data for now.
jobs.get("/technicians", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  // Mock technicians data - replace with actual user table query when available
  const mockTechnicians = [
    { id: "tech-001", name: "John Smith", email: "john@example.com" },
    { id: "tech-002", name: "Sarah Johnson", email: "sarah@example.com" },
    { id: "tech-003", name: "Mike Wilson", email: "mike@example.com" },
    { id: "tech-004", name: "Lisa Chen", email: "lisa@example.com" }
  ];
  res.json(mockTechnicians);
});

// --- RANGE with optional techId filter ---
jobs.get("/range", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { start, end, techId } = req.query as { start?: string; end?: string; techId?: string };

  if (!start || !end) return res.status(400).json({ error: "start and end are required (ISO strings)" });

  try {
    // For now, ignore techId filter since job_assignments table doesn't exist
    // When techId is provided, we'll return empty results to simulate filtered view
    if (techId && techId !== "" && techId !== "none") {
      // Return empty array for now when filtering by specific technician
      // TODO: Implement proper job assignments when users table is available
      res.json([]);
      return;
    }

    // Get all jobs in date range without technician filtering
    const r: any = await db.execute(sql`
      select j.id, j.title, j.status, 
             to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
             j.customer_id, coalesce(c.name,'—') as customer_name
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.org_id=${orgId}::uuid
        and j.scheduled_at is not null
        and j.scheduled_at >= ${start}::timestamptz
        and j.scheduled_at <  ${end}::timestamptz
      order by j.scheduled_at asc
    `);
    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/jobs/range error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

// GET /customers - Return dropdown data by org
jobs.get("/customers", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs/customers org=%s", orgId);
    
    const result = await db
      .select({
        id: customers.id,
        name: customers.name,
      })
      .from(customers)
      .where(eq(customers.orgId, orgId));

    res.json(result);
  } catch (error: any) {
    console.error("GET /api/jobs/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customers" });
  }
});

// GET /equipment - Return dropdown data by org
jobs.get("/equipment", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs/equipment org=%s", orgId);
    
    const result = await db
      .select({
        id: equipment.id,
        name: equipment.name,
      })
      .from(equipment)
      .where(eq(equipment.orgId, orgId));

    res.json(result);
  } catch (error: any) {
    console.error("GET /api/jobs/equipment error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch equipment" });
  }
});

// GET /:jobId - Return specific job with details
jobs.get("/:jobId", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs/%s org=%s", jobId, orgId);

    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const jr: any = await db.execute(sql`
      select
        j.id, j.title, j.description, j.status, 
        to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
        j.customer_id,
        coalesce(c.name,'—') as customer_name,
        c.address as customer_address,
        c.phone as customer_phone
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.id=${jobId}::uuid and j.org_id=${orgId}::uuid
    `);
    
    const result = jr.rows;

    if (!result.length) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(result[0]);
  } catch (error: any) {
    console.error("GET /api/jobs/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch job" });
  }
});

// POST /create - Insert new job
jobs.post("/create", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id || null;

  let { title, description, customerId, scheduledAt, equipmentId, assignedTechIds } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  // normalize inputs
  if (customerId === "") customerId = null;
  if (equipmentId === "") equipmentId = null;

  // Use the new timezone normalization function
  const scheduled = normalizeScheduledAt(scheduledAt);

  try {
    console.log("[DEBUG] Creating job with values:", {
      orgId: orgId,
      customerId: customerId || null,
      title: title,
      description: description || null,
      scheduledAt: scheduledAt,
      status: 'new',
      createdBy: userId || null,
    });
    
    const result = await db.execute(sql`
      INSERT INTO jobs (org_id, customer_id, title, description, scheduled_at, status, created_by)
      VALUES (
        ${orgId},
        ${customerId || null},
        ${title},
        ${description || null},
        ${scheduled || null},
        'new',
        ${userId || null}
      )
      RETURNING id
    `);
    
    const jobId = (result as any).rows[0].id;

    if (equipmentId) {
      await db.execute(sql`
        insert into job_equipment (job_id, equipment_id)
        values (${jobId}::uuid, ${equipmentId}::uuid)
        on conflict do nothing
      `);
    }

    // create job assignments if provided
    if (Array.isArray(assignedTechIds) && assignedTechIds.length > 0) {
      for (const uid of assignedTechIds) {
        if (!uid) continue;
        await db.execute(sql`
          insert into job_assignments (job_id, user_id)
          values (${jobId}::uuid, ${uid}::uuid)
          on conflict do nothing
        `);
      }
    }

    res.json({ ok: true, id: jobId });
  } catch (e: any) {
    console.error("POST /api/jobs/create error:", e);
    res.status(500).json({ error: e?.message || "create failed" });
  }
});

// --- DRAG-TO-RESCHEDULE (just update scheduled_at) ---
jobs.patch("/:jobId/schedule", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const { scheduledAt } = req.body || {};
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return res.status(400).json({ error: "invalid jobId" });
  if (!scheduledAt) return res.status(400).json({ error: "scheduledAt required (ISO)" });

  await db.execute(sql`
    update jobs set scheduled_at = ${scheduledAt}::timestamptz
    where id=${jobId}::uuid and org_id=${orgId}::uuid
  `);

  res.json({ ok: true });
});

// PUT /:jobId - Update job
jobs.put("/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  // Validate ID quickly
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return res.status(400).json({ error: "Invalid jobId" });
  }

  let { title, description, status, scheduledAt, customerId } = req.body || {};
  if (customerId === "") customerId = null;

  // Use the new timezone normalization function
  const scheduled = normalizeScheduledAt(scheduledAt);

  // Always log what we received (so we know the route is hit)
  console.log("PUT /api/jobs/%s org=%s body=%o", jobId, orgId, {
    title, description, status, scheduledAt: scheduled, customerId
  });

  try {
    // Use SQL for update with timezone-aware scheduled_at
    const result = await db.execute(sql`
      UPDATE jobs SET 
        title = coalesce(${title}, title),
        description = coalesce(${description}, description),
        status = coalesce(${status}, status),
        scheduled_at = coalesce(${scheduled}, scheduled_at),
        customer_id = ${customerId}
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      RETURNING id
    `);

    if (!(result as any).rows.length) {
      console.warn("PUT /api/jobs/%s -> no match for org=%s", jobId, orgId);
      return res.status(404).json({ error: "Job not found" });
    }

    console.log("PUT /api/jobs/%s -> ok", jobId);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/jobs/%s error:", jobId, error);
    res.status(500).json({ error: error?.message || "Update failed" });
  }
});

// Photo routes

// GET /:jobId/photos - List photos for a job
jobs.get("/:jobId/photos", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;
    
    console.log("[TRACE] GET /api/jobs/%s/photos org=%s", jobId, orgId);
    
    const result = await db.execute(sql`
      SELECT id, url, created_at
      FROM job_photos
      WHERE job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    
    res.json((result as any).rows || []);
  } catch (error: any) {
    console.error("GET /api/jobs/%s/photos error:", req.params.jobId, error);
    res.status(500).json({ error: error?.message || "Failed to fetch photos" });
  }
});

// POST /:jobId/photos - Upload photo for a job
jobs.post("/:jobId/photos", requireAuth, requireOrg, upload.single("photo"), async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }
    
    // Create unique filename
    const filename = `${Date.now()}-${file.originalname}`;
    const destPath = path.join("uploads", filename);
    
    // Move file from temp location to uploads folder
    fs.renameSync(file.path, destPath);
    
    const url = `/uploads/${filename}`;
    
    console.log("[TRACE] POST /api/jobs/%s/photos org=%s file=%s", jobId, orgId, filename);
    
    // Insert into database
    const result = await db.execute(sql`
      INSERT INTO job_photos (job_id, org_id, url)
      VALUES (${jobId}::uuid, ${orgId}::uuid, ${url})
      RETURNING id, url, created_at
    `);
    
    const photo = (result as any).rows[0];
    res.json(photo);
  } catch (error: any) {
    console.error("POST /api/jobs/%s/photos error:", req.params.jobId, error);
    res.status(500).json({ error: error?.message || "Failed to upload photo" });
  }
});

// DELETE /:jobId/photos/:photoId - Delete a photo
jobs.delete("/:jobId/photos/:photoId", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId, photoId } = req.params;
    const orgId = (req as any).orgId;
    
    console.log("[TRACE] DELETE /api/jobs/%s/photos/%s org=%s", jobId, photoId, orgId);
    
    // Get photo info before deleting to remove file
    const photoResult = await db.execute(sql`
      SELECT url FROM job_photos 
      WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    
    const photos = (photoResult as any).rows || [];
    if (photos.length > 0) {
      const photoUrl = photos[0].url;
      // Remove file from filesystem if it exists
      const filePath = path.join(".", photoUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Delete from database
    await db.execute(sql`
      DELETE FROM job_photos 
      WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    
    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/jobs/%s/photos/%s error:", req.params.jobId, req.params.photoId, error);
    res.status(500).json({ error: error?.message || "Failed to delete photo" });
  }
});

/* NOTES */
jobs.get("/:jobId/notes", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; 
  const orgId = (req as any).orgId;
  try {
    const r: any = await db.execute(sql`
      select id, text, created_at
      from job_notes
      where job_id=${jobId}::uuid and org_id=${orgId}::uuid
      order by created_at desc
    `);
    res.json(r.rows);
  } catch (e: any) {
    console.error("GET /api/jobs/:jobId/notes error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch notes" });
  }
});

jobs.post("/:jobId/notes", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; 
  const orgId = (req as any).orgId;
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  try {
    const r: any = await db.execute(sql`
      insert into job_notes (job_id, org_id, text)
      values (${jobId}::uuid, ${orgId}::uuid, ${text})
      returning id, text, created_at
    `);
    res.json(r.rows[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/notes error:", e);
    res.status(500).json({ error: e?.message || "Failed to add note" });
  }
});

/* CHARGES */
jobs.get("/:jobId/charges", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; 
  const orgId = (req as any).orgId;
  try {
    const r: any = await db.execute(sql`
      select id, kind, description, quantity, unit_price, total, created_at
      from job_charges
      where job_id=${jobId}::uuid and org_id=${orgId}::uuid
      order by created_at desc
    `);
    res.json(r.rows);
  } catch (e: any) {
    console.error("GET /api/jobs/:jobId/charges error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch charges" });
  }
});

jobs.post("/:jobId/charges", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; 
  const orgId = (req as any).orgId;
  let { kind, description, quantity, unitPrice } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: "description required" });
  kind = kind || "labour";
  quantity = Number(quantity) || 0;
  unitPrice = Number(unitPrice) || 0;
  const total = quantity * unitPrice;

  try {
    const r: any = await db.execute(sql`
      insert into job_charges (job_id, org_id, kind, description, quantity, unit_price, total)
      values (${jobId}::uuid, ${orgId}::uuid, ${kind}, ${description}, ${quantity}, ${unitPrice}, ${total})
      returning id, kind, description, quantity, unit_price, total, created_at
    `);
    res.json(r.rows[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/charges error:", e);
    res.status(500).json({ error: e?.message || "Failed to add charge" });
  }
});

/* DELETE */
jobs.delete("/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  await db.execute(sql`
    delete from jobs
    where id=${jobId}::uuid and org_id=${orgId}::uuid
  `);

  res.json({ ok: true });
});



export default jobs;