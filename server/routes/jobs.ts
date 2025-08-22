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

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Add ping endpoint for health check
jobs.get("/ping", (_req, res) => {
  console.log("[TRACE] GET /api/jobs/ping");
  res.json({ ok: true });
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
        j.scheduled_at,
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

    const result = await db
      .select({
        id: jobsSchema.id,
        title: jobsSchema.title,
        description: jobsSchema.description,
        status: jobsSchema.status,
        scheduled_at: jobsSchema.scheduledAt,
        customer_id: jobsSchema.customerId,
        customer_name: customers.name,
        created_at: jobsSchema.createdAt,
      })
      .from(jobsSchema)
      .leftJoin(customers, eq(jobsSchema.customerId, customers.id))
      .where(and(eq(jobsSchema.id, jobId), eq(jobsSchema.orgId, orgId)))
      .limit(1);

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

  let { title, description, customerId, scheduledAt, equipmentId } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  // normalize inputs
  if (customerId === "") customerId = null;
  if (equipmentId === "") equipmentId = null;

  // allow datetime-local values like 2025-08-22T10:30
  const normalizeDate = (v: any): string | null => {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v);
    if (s.includes("T")) {
      const [d, t] = s.split("T");
      const tt = t.length === 5 ? `${t}:00` : t; // HH:MM -> HH:MM:SS
      return `${d} ${tt}`.slice(0, 19);
    }
    return s;
  };
  scheduledAt = normalizeDate(scheduledAt);

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
        ${scheduledAt || null},
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

    res.json({ ok: true, id: jobId });
  } catch (e: any) {
    console.error("POST /api/jobs/create error:", e);
    res.status(500).json({ error: e?.message || "create failed" });
  }
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

  // Convert date strings to Date objects for Drizzle
  let scheduledAtDate: Date | null = null;
  if (scheduledAt && scheduledAt !== "") {
    console.log("[DEBUG] Converting scheduledAt:", scheduledAt, typeof scheduledAt);
    try {
      // Handle various date formats
      let dateStr = String(scheduledAt);
      if (dateStr.includes("T")) {
        // Convert "2024-08-22T10:00" to "2024-08-22 10:00:00"
        const [d, t] = dateStr.split("T");
        const time = t.length === 5 ? `${t}:00` : t;
        dateStr = `${d} ${time}`;
      }
      
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        scheduledAtDate = date;
        console.log("[DEBUG] Converted to Date:", scheduledAtDate);
      } else {
        console.warn("[DEBUG] Invalid date:", dateStr);
      }
    } catch (err) {
      console.warn("[DEBUG] Date conversion error:", err);
    }
  }
  
  scheduledAt = scheduledAtDate;

  // Always log what we received (so we know the route is hit)
  console.log("PUT /api/jobs/%s org=%s body=%o", jobId, orgId, {
    title, description, status, scheduledAt, customerId
  });

  try {
    // Prepare update data - only include defined fields and handle nulls properly
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt; // Already converted to Date above
    if (customerId !== undefined) updateData.customerId = customerId;
    
    // Skip updatedAt to avoid timestamp issues
    // updateData.updatedAt = new Date();

    const result = await db
      .update(jobsSchema)
      .set(updateData)
      .where(and(eq(jobsSchema.id, jobId), eq(jobsSchema.orgId, orgId)))
      .returning({ id: jobsSchema.id });

    if (!result.length) {
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

// Default export
export default jobs;