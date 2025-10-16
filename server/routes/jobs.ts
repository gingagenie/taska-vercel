import { Router } from "express";
import { db } from "../db/client";
import { jobs as jobsSchema, customers, equipment, jobPhotos, users, jobAssignments } from "../../shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { sql, eq, and } from "drizzle-orm";

export const jobs = Router();

// UUID validation helper
function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

// Timezone-aware scheduled_at normalization
function normalizeScheduledAt(raw: any): string|null {
  if (!raw) return null;
  // If client already sent proper UTC ISO with Z, pass it through
  if (typeof raw === "string" && /Z$/.test(raw)) return raw;
  // If it looks like "YYYY-MM-DDTHH:mm" (datetime-local), it should now be coming pre-converted from client
  // Client should use isoFromLocalInput() to convert Melbourne time to UTC before sending
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    // Treat as Melbourne time and convert to UTC (subtract 10 hours)
    const localDate = new Date(raw + ":00"); // Add seconds if missing
    const utcDate = new Date(localDate.getTime() - (10 * 60 * 60 * 1000)); // Melbourne is UTC+10
    if (!isNaN(utcDate.valueOf())) return utcDate.toISOString();
  }
  // Fallback: let Postgres parse; but ensure timestamptz column
  return raw;
}

// Configure multer for file uploads with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept only image files including HEIF/HEIC variants from iOS devices
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/heic-sequence'];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC/HEIF)'));
    }
  },
});

// Add ping endpoint for health check
jobs.get("/ping", (_req, res) => {
  console.log("[TRACE] GET /api/jobs/ping");
  res.json({ ok: true });
});

// GET /api/jobs/equipment?customerId=uuid - Filter equipment by customer for job creation
jobs.get("/equipment", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  const customerId = (req.query.customerId as string | undefined) || undefined;

  try {
    const r: any = await db.execute(sql`
      select id, name
      from equipment
      where org_id = ${orgId}::uuid
      ${customerId ? sql`and customer_id = ${customerId}::uuid` : sql``}
      order by name asc
    `);
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs/equipment error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch equipment" });
  }
});

/* LIST COMPLETED JOBS */
jobs.get("/completed", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/completed org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      SELECT 
        cj.id,
        cj.original_job_id,
        cj.customer_id,
        cj.customer_name,
        cj.title,
        cj.description,
        cj.notes,
        cj.scheduled_at,
        cj.completed_at,
        cj.completed_by,
        cj.original_created_by,
        cj.original_created_at,
        COALESCE(COUNT(DISTINCT cjp.id), 0)::int as photo_count,
        CASE WHEN inv.id IS NOT NULL THEN true ELSE false END as has_invoice
      FROM completed_jobs cj
      LEFT JOIN completed_job_photos cjp ON cjp.completed_job_id = cj.id AND cjp.org_id = cj.org_id
      LEFT JOIN invoices inv ON inv.job_id = cj.original_job_id AND inv.org_id = cj.org_id
      WHERE cj.org_id = ${orgId}::uuid
      GROUP BY cj.id, cj.original_job_id, cj.customer_id, cj.customer_name, cj.title, 
               cj.description, cj.notes, cj.scheduled_at, cj.completed_at, cj.completed_by,
               cj.original_created_by, cj.original_created_at, inv.id
      ORDER BY cj.completed_at DESC
    `);
    
    // Disable caching to ensure fresh data after invoice conversions
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed jobs" });
  }
});

/* GET INDIVIDUAL COMPLETED JOB */
jobs.get("/completed/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/completed/%s org=%s", jobId, orgId);
  
  try {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const r: any = await db.execute(sql`
      SELECT 
        id,
        original_job_id,
        customer_id,
        customer_name,
        title,
        description,
        notes,
        scheduled_at,
        completed_at,
        completed_by,
        original_created_by,
        original_created_at
      FROM completed_jobs
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    
    if (r.length === 0) {
      return res.status(404).json({ error: "Completed job not found" });
    }
    
    res.json(r[0]);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job" });
  }
});

// GET /completed/:jobId/notes - Get notes for completed job
jobs.get("/completed/:jobId/notes", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/completed/%s/notes org=%s", jobId, orgId);
  
  try {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const r: any = await db.execute(sql`
      SELECT id, text, created_at
      FROM completed_job_notes
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s/notes error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job notes" });
  }
});

// GET /completed/:jobId/photos - Get photos for completed job
jobs.get("/completed/:jobId/photos", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/completed/%s/photos org=%s", jobId, orgId);
  
  try {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const r: any = await db.execute(sql`
      SELECT id, url, created_at
      FROM completed_job_photos
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    
    // Transform Supabase keys to signed URLs
    const { createSignedViewUrl } = await import("../services/supabase-storage");
    
    const photos = await Promise.all(r.map(async (photo: any) => {
      // Check if URL is a Supabase key (starts with org/)
      if (photo.url && photo.url.startsWith('org/')) {
        const signedUrl = await createSignedViewUrl(photo.url, 900); // 15 min expiry
        return {
          ...photo,
          url: signedUrl || photo.url, // Fallback to original if signing fails
        };
      }
      return photo;
    }));
    
    res.json(photos);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s/photos error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job photos" });
  }
});

// GET /completed/:jobId/equipment - Get equipment for completed job
jobs.get("/completed/:jobId/equipment", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/completed/%s/equipment org=%s", jobId, orgId);
  
  try {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const r: any = await db.execute(sql`
      SELECT equipment_id, equipment_name, created_at
      FROM completed_job_equipment
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY equipment_name ASC
    `);
    
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s/equipment error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job equipment" });
  }
});

/* LIST (now includes description) */
jobs.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select
        j.id,
        j.title,
        j.description,
        j.status,
        to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
        j.customer_id,
        coalesce(c.name,'—') as customer_name
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.org_id=${orgId}::uuid
      order by j.scheduled_at asc nulls last, j.created_at desc
    `);

    // Add technician data with colors for each job
    for (const job of r) {
      try {
        const techniciansResult: any = await db.execute(sql`
          select u.id, u.name, u.color
          from job_assignments ja
          join users u on u.id = ja.user_id
          where ja.job_id = ${job.id}
          order by u.name
        `);
        job.technicians = techniciansResult || [];
      } catch (e) {
        job.technicians = [];
      }
    }
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

// --- TECH FILTER SOURCE ---
// Return technicians in this org (id + name). Query from actual users/memberships.
jobs.get("/technicians", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/jobs/technicians org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select id, name, email, role, color
      from users
      where org_id = ${orgId}::uuid
      order by name asc
    `);
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs/technicians error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch technicians" });
  }
});

// --- RANGE with optional techId filter ---
jobs.get("/range", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  const { start, end, techId } = req.query as { start?: string; end?: string; techId?: string };

  if (!start || !end) return res.status(400).json({ error: "start and end are required (ISO strings)" });

  try {
    // Build the query with optional technician filtering
    let query = sql`
      select j.id, j.title, j.status, 
             to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
             j.customer_id, coalesce(c.name,'—') as customer_name
      from jobs j
      left join customers c on c.id = j.customer_id
    `;
    
    // Add technician filter if specified
    if (techId && techId !== "" && techId !== "none") {
      query = sql`
        select j.id, j.title, j.status, 
               to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
               j.customer_id, coalesce(c.name,'—') as customer_name
        from jobs j
        left join customers c on c.id = j.customer_id
        inner join job_assignments ja on ja.job_id = j.id
        where j.org_id = ${orgId}::uuid
          and ja.user_id = ${techId}
          and j.scheduled_at is not null
          and j.scheduled_at >= ${start}::timestamptz
          and j.scheduled_at <  ${end}::timestamptz
        order by j.scheduled_at asc
      `;
    } else {
      query = sql`
        select j.id, j.title, j.status, 
               to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
               j.customer_id, coalesce(c.name,'—') as customer_name
        from jobs j
        left join customers c on c.id = j.customer_id
        where j.org_id = ${orgId}::uuid
          and j.scheduled_at is not null
          and j.scheduled_at >= ${start}::timestamptz
          and j.scheduled_at <  ${end}::timestamptz
        order by j.scheduled_at asc
      `;
    }

    const r: any = await db.execute(query);
    
    // Add technician data with colors for each job
    for (const job of r) {
      try {
        const techniciansResult: any = await db.execute(sql`
          select u.id, u.name, u.color
          from job_assignments ja
          join users u on u.id = ja.user_id
          where ja.job_id = ${job.id}
          order by u.name
        `);
        job.technicians = techniciansResult || [];
      } catch (e) {
        job.technicians = [];
      }
    }
    
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs/range error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

// GET /customers - Return dropdown data by org
jobs.get("/customers", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs/customers org=%s", orgId);
    
    const result = await db.execute(sql`
      select id, name
      from customers
      where org_id = ${orgId}::uuid
      order by name asc
    `);

    res.json(result);
  } catch (error: any) {
    console.error("GET /api/jobs/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customers" });
  }
});

// GET /equipment - Return dropdown data by org  
jobs.get("/equipment", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs/equipment org=%s", orgId);
    
    const result = await db.execute(sql`
      select id, name
      from equipment
      where org_id = ${orgId}::uuid
      order by name asc
    `);

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
        j.id, j.title, j.description, j.status, j.notes,
        to_char(j.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scheduled_at,
        j.customer_id,
        coalesce(c.name,'—') as customer_name,
        c.address as customer_address,
        c.phone as customer_phone
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.id=${jobId}::uuid and j.org_id=${orgId}::uuid
    `);
    
    if (!jr || jr.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = jr[0];

    // Fetch assigned technicians
    try {
      const techniciansResult: any = await db.execute(sql`
        select u.id, u.name, u.email, u.color
        from job_assignments ja
        join users u on u.id = ja.user_id
        where ja.job_id = ${jobId}
        order by u.name
      `);
      job.technicians = techniciansResult || [];
    } catch (e) {
      console.log("Technicians query error:", e);
      job.technicians = [];
    }

    // Fetch assigned equipment  
    try {
      const equipmentResult: any = await db.execute(sql`
        select e.id, e.name, e.make, e.model
        from job_equipment je
        join equipment e on e.id = je.equipment_id
        where je.job_id = ${jobId}
        order by e.name
      `);
      job.equipment = equipmentResult || [];
    } catch (e) {
      console.log("Equipment query error:", e);
      job.equipment = [];
    }

    res.json(job);
  } catch (error: any) {
    console.error("GET /api/jobs/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch job" });
  }
});

// POST /create - Insert new job
jobs.post("/create", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id || null;

  let { title, description, jobType, customerId, scheduledAt, equipmentId, assignedTechIds } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  // normalize inputs
  if (customerId === "") customerId = null;
  if (equipmentId === "") equipmentId = null;
  if (jobType === "") jobType = null;

  // Use the new timezone normalization function
  const scheduled = normalizeScheduledAt(scheduledAt);

  try {
    console.log("[DEBUG] Creating job with values:", {
      orgId: orgId,
      customerId: customerId || null,
      title: title,
      description: description || null,
      jobType: jobType || null,
      scheduledAt: scheduledAt,
      status: 'new',
      createdBy: userId || null,
    });
    
    const result = await db.execute(sql`
      INSERT INTO jobs (org_id, customer_id, title, description, job_type, scheduled_at, status, created_by)
      VALUES (
        ${orgId},
        ${customerId || null},
        ${title},
        ${description || null},
        ${jobType || null},
        ${scheduled || null},
        'new',
        ${userId || null}
      )
      RETURNING id
    `);
    
    const jobId = (result as any)[0].id;

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

  let { title, description, status, scheduledAt, customerId, assignedUserId } = req.body || {};
  if (customerId === "") customerId = null;
  if (assignedUserId === "") assignedUserId = null;

  // Use the new timezone normalization function
  const scheduled = normalizeScheduledAt(scheduledAt);

  // Always log what we received (so we know the route is hit)
  console.log("PUT /api/jobs/%s org=%s body=%o", jobId, orgId, {
    title, description, status, scheduledAt: scheduled, customerId, assignedUserId
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

    if (!result.length) {
      console.warn("PUT /api/jobs/%s -> no match for org=%s", jobId, orgId);
      return res.status(404).json({ error: "Job not found" });
    }

    // Handle assignment update
    // Validate assignedUserId format and org membership if provided
    if (assignedUserId) {
      // Check UUID format
      if (!isUuid(assignedUserId)) {
        return res.status(400).json({ error: "Invalid assignedUserId format" });
      }
      
      // Validate that user belongs to the same org
      const userCheck: any = await db.execute(sql`
        SELECT 1 FROM users 
        WHERE id = ${assignedUserId}::uuid AND org_id = ${orgId}::uuid
      `);
      
      if (!userCheck.length) {
        return res.status(400).json({ error: "Invalid user assignment - user not found in organization" });
      }
    }

    // Delete all existing assignments for this job
    await db.execute(sql`
      DELETE FROM job_assignments
      WHERE job_id = ${jobId}::uuid
    `);

    // Create new assignment if provided
    if (assignedUserId) {
      await db.execute(sql`
        INSERT INTO job_assignments (job_id, user_id)
        VALUES (${jobId}::uuid, ${assignedUserId}::uuid)
        ON CONFLICT DO NOTHING
      `);
    }

    console.log("PUT /api/jobs/%s -> ok (assignment updated)", jobId);
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
    
    // Validate jobId format
    if (!isUuid(jobId)) {
      return res.status(400).json({ error: "Invalid job ID format" });
    }
    
    console.log("[TRACE] GET /api/jobs/%s/photos org=%s", jobId, orgId);
    
    // Query photos from database
    const result = await db.execute(sql`
      SELECT id, url, object_key, created_at 
      FROM job_photos 
      WHERE job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    
    res.json(result);
  } catch (error: any) {
    console.error("GET /api/jobs/%s/photos error:", req.params.jobId, error);
    res.status(500).json({ error: error?.message || "Failed to fetch photos" });
  }
});

// POST /:jobId/photos - Upload photo for a job
jobs.post("/:jobId/photos", requireAuth, requireOrg, (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "File size exceeds 10MB limit" });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message || "Invalid file type" });
      }
    }
    next();
  });
}, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    
    // Validate jobId format
    if (!isUuid(jobId)) {
      return res.status(400).json({ error: "Invalid job ID format" });
    }
    
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }
    
    if (!file.buffer) {
      return res.status(500).json({ error: "File buffer not available" });
    }
    
    // Sanitize and validate file extension
    let ext = 'jpg'; // default
    if (file.originalname && file.originalname.includes('.')) {
      const parts = file.originalname.split('.');
      const rawExt = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
      // Map MIME type to extension if needed
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
        'image/heic-sequence': 'heic',
      };
      ext = mimeToExt[file.mimetype] || rawExt || 'jpg';
    }
    
    // Verify job exists and belongs to org before uploading
    const jobCheck: any = await db.execute(sql`
      SELECT id FROM jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    if (jobCheck.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Try Supabase Storage first, fall back to Replit/local if it fails
    try {
      const { uploadPhotoToSupabase } = await import("../services/supabase-storage");
      const { media } = await import("../../shared/schema");
      
      console.log(`[PHOTO_UPLOAD] Attempting Supabase upload for job=${jobId}`);
      
      // Upload to Supabase Storage
      const uploadResult = await uploadPhotoToSupabase({
        tenantId: orgId,
        jobId,
        ext,
        fileBuffer: file.buffer,
        contentType: file.mimetype,
      });
      
      // Store in media table
      const [mediaRecord] = await db.insert(media).values({
        orgId,
        jobId,
        key: uploadResult.key,
        kind: "photo",
        ext,
        bytes: file.size,
        isPublic: false,
        createdBy: userId,
      }).returning();
      
      // Also create job_photos record for backward compatibility
      const url = `/api/media/${mediaRecord.id}/url`;
      const result = await db.execute(sql`
        INSERT INTO job_photos (job_id, org_id, url, object_key, media_id)
        VALUES (${jobId}::uuid, ${orgId}::uuid, ${url}, ${uploadResult.key}, ${mediaRecord.id})
        RETURNING id, url, object_key, created_at
      `);
      
      console.log(`[PHOTO_UPLOAD] Supabase upload success: mediaId=${mediaRecord.id}, key=${uploadResult.key}`);
      
      const photo = result[0];
      res.json(photo);
      return;
    } catch (supabaseError: any) {
      console.warn(`[PHOTO_UPLOAD] Supabase upload failed, falling back to Replit storage:`, supabaseError.message);
      
      // Fall back to Replit/local storage
      const { jobPhotoKey, absolutePathForKey, disableObjectStorage } = await import("../storage/paths");
      const { logStorage } = await import("../storage/log");
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      
      // Create unique filename
      const timestamp = Date.now();
      const safeName = `${timestamp}-${file.originalname?.replace(/\s+/g, "_") || 'upload'}.${ext}`;
      
      // Generate key (canonical identifier stored in DB)
      const key = jobPhotoKey(orgId, jobId, safeName);
      let absolutePath = absolutePathForKey(key);
      
      // Upload to file system with fallback retry
      try {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, file.buffer);
        logStorage("UPLOAD", { who: userId, key });
      } catch (uploadError: any) {
        if (uploadError?.code === "ENOENT" || uploadError?.code === "EACCES") {
          // Object storage unavailable - disable and retry with fallback
          disableObjectStorage();
          absolutePath = absolutePathForKey(key);
          
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, file.buffer);
          logStorage("UPLOAD", { who: userId, key, storage: "local fallback (after failure)" });
        } else {
          throw uploadError;
        }
      }
      
      try {
        // Insert into database with both URL (for compatibility) and key
        const url = `/api/objects/${key}`;
        const result = await db.execute(sql`
          INSERT INTO job_photos (job_id, org_id, url, object_key)
          VALUES (${jobId}::uuid, ${orgId}::uuid, ${url}, ${key})
          RETURNING id, url, object_key, created_at
        `);
        
        const photo = result[0];
        res.json(photo);
      } catch (dbError: any) {
        // If DB insert fails, clean up the uploaded file
        try {
          await fs.unlink(absolutePath);
          logStorage("UPLOAD_ROLLBACK", { key });
        } catch (cleanupError: any) {
          console.error("Failed to clean up file after DB error:", cleanupError);
        }
        throw dbError;
      }
    }
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
    const userId = (req as any).user?.id;
    
    // Validate UUIDs format
    if (!isUuid(jobId) || !isUuid(photoId)) {
      return res.status(400).json({ error: "Invalid job or photo ID format" });
    }
    
    // Get photo info before deleting
    const photoResult = await db.execute(sql`
      SELECT object_key, url FROM job_photos 
      WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    
    if (photoResult.length > 0) {
      const photo = photoResult[0] as any;
      // Prefer object_key, fallback to extracting from url
      const key = photo.object_key || photo.url?.replace('/objects/', '');
      
      if (key) {
        try {
          // Import storage modules
          const { absolutePathForKey, disableObjectStorage } = await import("../storage/paths");
          const { logStorage } = await import("../storage/log");
          const fs = await import("node:fs/promises");
          
          let absolutePath = absolutePathForKey(key);
          
          // Delete file from storage with fallback retry
          try {
            await fs.unlink(absolutePath);
            logStorage("DELETE", { who: userId, key });
          } catch (deleteError: any) {
            if (deleteError?.code === "ENOENT" || deleteError?.code === "EACCES") {
              // Try with fallback
              disableObjectStorage();
              absolutePath = absolutePathForKey(key);
              await fs.unlink(absolutePath);
              logStorage("DELETE", { who: userId, key, storage: "local fallback (after failure)" });
            } else {
              throw deleteError;
            }
          }
        } catch (storageError: any) {
          console.error("Error deleting from storage:", storageError);
          // Continue with database deletion even if storage deletion fails
        }
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
    res.json(r);
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
    res.json(r[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/notes error:", e);
    res.status(500).json({ error: e?.message || "Failed to add note" });
  }
});

jobs.put("/:jobId/notes", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; 
  const orgId = (req as any).orgId;
  const { notes } = req.body || {};
  try {
    await db.execute(sql`
      update jobs 
      set notes = ${notes || ''}, updated_at = now()
      where id = ${jobId}::uuid and org_id = ${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/jobs/:jobId/notes error:", e);
    res.status(500).json({ error: e?.message || "Failed to save notes" });
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
    res.json(r);
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
    res.json(r[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/charges error:", e);
    res.status(500).json({ error: e?.message || "Failed to add charge" });
  }
});

/* COMPLETE JOB - Move job to completed_jobs table */
jobs.post("/:jobId/complete", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id;
  
  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  try {
    // First, get the job details from the jobs table
    const jobResult: any = await db.execute(sql`
      SELECT j.*, c.name as customer_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      WHERE j.id = ${jobId}::uuid AND j.org_id = ${orgId}::uuid
    `);

    if (jobResult.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = jobResult[0];

    // Start a transaction to ensure atomicity
    await db.execute(sql`BEGIN`);
    
    console.log(`[JOB COMPLETION] Starting completion of job ${jobId} (${job.title})`);

    // Insert into completed_jobs table
    const completedResult: any = await db.execute(sql`
      INSERT INTO completed_jobs (
        org_id, original_job_id, customer_id, customer_name, title, description, job_type, notes,
        scheduled_at, completed_by, original_created_by, original_created_at
      )
      VALUES (
        ${orgId}::uuid, ${jobId}::uuid, ${job.customer_id}::uuid, ${job.customer_name},
        ${job.title}, ${job.description}, ${job.job_type}, ${job.notes}, ${job.scheduled_at},
        ${userId}, ${job.created_by}, ${job.created_at}
      )
      RETURNING id, completed_at
    `);

    // Copy job charges to preserve them (since they'll be deleted by CASCADE when job is deleted)
    // Create the table if it doesn't exist first
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS completed_job_charges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        completed_job_id uuid NOT NULL,
        original_job_id uuid NOT NULL,
        org_id uuid NOT NULL,
        kind text NOT NULL,
        description text NOT NULL,
        quantity numeric NOT NULL DEFAULT 0,
        unit_price numeric NOT NULL DEFAULT 0,
        total numeric NOT NULL DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `);

    // Copy existing charges to the completed job charges table (if any)
    await db.execute(sql`
      INSERT INTO completed_job_charges (
        completed_job_id, original_job_id, org_id, kind, description, quantity, unit_price, total, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        org_id,
        kind,
        description,
        quantity,
        unit_price,
        total,
        created_at
      FROM job_charges
      WHERE job_id = ${jobId}::uuid
    `);

    // Copy hours to completed job hours table
    await db.execute(sql`
      INSERT INTO completed_job_hours (
        completed_job_id, original_job_id, org_id, hours, description, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        org_id,
        hours,
        description,
        created_at
      FROM job_hours
      WHERE job_id = ${jobId}::uuid
    `);

    // Copy parts to completed job parts table
    await db.execute(sql`
      INSERT INTO completed_job_parts (
        completed_job_id, original_job_id, org_id, part_name, quantity, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        org_id,
        part_name,
        quantity,
        created_at
      FROM job_parts
      WHERE job_id = ${jobId}::uuid
    `);

    // Copy notes to completed job notes table
    await db.execute(sql`
      INSERT INTO completed_job_notes (
        completed_job_id, original_job_id, org_id, text, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        org_id,
        text,
        created_at
      FROM job_notes
      WHERE job_id = ${jobId}::uuid
    `);

    // Copy photos to completed job photos table
    await db.execute(sql`
      INSERT INTO completed_job_photos (
        completed_job_id, original_job_id, org_id, url, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        org_id,
        url,
        created_at
      FROM job_photos
      WHERE job_id = ${jobId}::uuid
    `);

    // Copy equipment to completed job equipment table (so we know what machine to charge against)
    await db.execute(sql`
      INSERT INTO completed_job_equipment (
        completed_job_id, original_job_id, org_id, equipment_id, equipment_name, created_at
      )
      SELECT 
        ${completedResult[0].id}::uuid,
        ${jobId}::uuid,
        ${orgId}::uuid,
        je.equipment_id,
        e.name,
        je.created_at
      FROM job_equipment je
      LEFT JOIN equipment e ON je.equipment_id = e.id
      WHERE je.job_id = ${jobId}::uuid
    `);

    // AUTO-CREATE FOLLOW-UP JOBS for Service jobs with equipment that has service intervals
    if (job.job_type === 'Service') {
      console.log('[JOB COMPLETION] Job type is Service, checking for equipment with service intervals...');
      
      // Get equipment with service intervals from this job
      const equipmentWithIntervals: any = await db.execute(sql`
        SELECT e.id, e.name, e.service_interval_months, e.customer_id
        FROM job_equipment je
        JOIN equipment e ON e.id = je.equipment_id
        WHERE je.job_id = ${jobId}::uuid 
          AND e.service_interval_months IS NOT NULL
      `);

      for (const eq of equipmentWithIntervals) {
        try {
          console.log(`[JOB COMPLETION] Creating follow-up for equipment ${eq.name} with ${eq.service_interval_months} month interval`);
          
          // Calculate next service date (today + interval months)
          const nextServiceDate = await db.execute(sql`
            SELECT (CURRENT_DATE + INTERVAL '${sql.raw(eq.service_interval_months.toString())} months')::timestamp as next_date
          `);
          const scheduledDate = (nextServiceDate as any)[0].next_date;

          // Create follow-up job
          const followUpResult = await db.execute(sql`
            INSERT INTO jobs (
              org_id, customer_id, title, description, job_type, 
              scheduled_at, status, created_by
            )
            VALUES (
              ${orgId}::uuid,
              ${eq.customer_id}::uuid,
              ${`Service - ${eq.name}`},
              ${`Follow-up service from ${job.title || 'completed job'}`},
              'Service',
              ${scheduledDate},
              'new',
              ${userId}
            )
            RETURNING id
          `);
          
          const followUpJobId = (followUpResult as any)[0].id;

          // Link equipment to new job
          await db.execute(sql`
            INSERT INTO job_equipment (job_id, equipment_id)
            VALUES (${followUpJobId}::uuid, ${eq.id}::uuid)
          `);

          // Update equipment service dates
          await db.execute(sql`
            UPDATE equipment 
            SET 
              last_service_date = CURRENT_DATE,
              next_service_date = ${scheduledDate}
            WHERE id = ${eq.id}::uuid
          `);

          console.log(`[JOB COMPLETION] ✓ Created follow-up job ${followUpJobId} scheduled for ${scheduledDate}`);
        } catch (err: any) {
          console.error(`[JOB COMPLETION] Failed to create follow-up for equipment ${eq.id}:`, err);
          // Continue with other equipment even if one fails
        }
      }
    }

    // Delete related records first, but preserve job_charges for the completed job
    await db.execute(sql`
      DELETE FROM job_notifications
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_assignments
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_equipment
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_photos
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_hours
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_notes
      WHERE job_id = ${jobId}::uuid
    `);
    
    await db.execute(sql`
      DELETE FROM job_parts
      WHERE job_id = ${jobId}::uuid
    `);

    // NOTE: We don't delete job_charges here so they remain accessible via original_job_id
    // Finally delete the job from the jobs table
    await db.execute(sql`
      DELETE FROM jobs
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);

    // Commit the transaction
    await db.execute(sql`COMMIT`);
    
    console.log(`[JOB COMPLETION] ✅ Successfully completed job ${jobId}, created completed_job ${completedResult[0].id}`);

    res.json({ 
      ok: true, 
      completed_job_id: completedResult[0].id,
      completed_at: completedResult[0].completed_at
    });
  } catch (e: any) {
    // Rollback the transaction on any error
    try {
      await db.execute(sql`ROLLBACK`);
      console.log('[JOB COMPLETION] Transaction rolled back due to error');
    } catch (rollbackErr) {
      console.error('[JOB COMPLETION] Failed to rollback transaction:', rollbackErr);
    }
    console.error("POST /api/jobs/:jobId/complete error:", e);
    res.status(500).json({ error: e?.message || "Failed to complete job" });
  }
});

/* ADD HOURS TO JOB */
jobs.post("/:jobId/hours", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const { hours, description } = req.body;
  const orgId = (req as any).orgId;
  
  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });
  if (!hours || typeof hours !== 'number' || hours % 0.5 !== 0) {
    return res.status(400).json({ error: "Hours must be in 0.5 increments" });
  }

  try {
    const r: any = await db.execute(sql`
      INSERT INTO job_hours (job_id, org_id, hours, description)
      VALUES (${jobId}::uuid, ${orgId}::uuid, ${hours}, ${description || ''})
      RETURNING id, hours, description, created_at
    `);
    res.json(r[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/hours error:", e);
    res.status(500).json({ error: e?.message || "Failed to add hours" });
  }
});

/* ADD PARTS TO JOB */
jobs.post("/:jobId/parts", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const { partName, quantity } = req.body;
  const orgId = (req as any).orgId;
  
  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });
  if (!partName || typeof partName !== 'string') {
    return res.status(400).json({ error: "Part name is required" });
  }
  if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be a positive whole number" });
  }

  try {
    const r: any = await db.execute(sql`
      INSERT INTO job_parts (job_id, org_id, part_name, quantity)
      VALUES (${jobId}::uuid, ${orgId}::uuid, ${partName}, ${quantity})
      RETURNING id, part_name, quantity, created_at
    `);
    res.json(r[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/parts error:", e);
    res.status(500).json({ error: e?.message || "Failed to add part" });
  }
});

/* GET HOURS FOR JOB */
jobs.get("/:jobId/hours", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  
  try {
    const r: any = await db.execute(sql`
      SELECT id, hours, description, created_at
      FROM job_hours
      WHERE job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/:jobId/hours error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch hours" });
  }
});

/* GET PARTS FOR JOB */
jobs.get("/:jobId/parts", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  
  try {
    const r: any = await db.execute(sql`
      SELECT id, part_name, quantity, created_at
      FROM job_parts
      WHERE job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/:jobId/parts error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch parts" });
  }
});

/* GET CHARGES FOR COMPLETED JOB */
jobs.get("/completed/:completedJobId/charges", requireAuth, requireOrg, async (req, res) => {
  const { completedJobId } = req.params;
  const orgId = (req as any).orgId;
  
  try {
    const r: any = await db.execute(sql`
      SELECT id, kind, description, quantity, unit_price, total, created_at
      FROM completed_job_charges
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/:completedJobId/charges error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job charges" });
  }
});

/* GET HOURS FOR COMPLETED JOB */
jobs.get("/completed/:completedJobId/hours", requireAuth, requireOrg, async (req, res) => {
  const { completedJobId } = req.params;
  const orgId = (req as any).orgId;
  
  try {
    const r: any = await db.execute(sql`
      SELECT id, hours, description, created_at
      FROM completed_job_hours
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/:completedJobId/hours error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job hours" });
  }
});

/* GET PARTS FOR COMPLETED JOB */
jobs.get("/completed/:completedJobId/parts", requireAuth, requireOrg, async (req, res) => {
  const { completedJobId } = req.params;
  const orgId = (req as any).orgId;
  
  try {
    const r: any = await db.execute(sql`
      SELECT id, part_name, quantity, created_at
      FROM completed_job_parts
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);
    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/:completedJobId/parts error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job parts" });
  }
});

/* CONVERT COMPLETED JOB TO INVOICE */
jobs.post("/completed/:completedJobId/convert-to-invoice", requireAuth, requireOrg, async (req, res) => {
  const { completedJobId } = req.params;
  const orgId = (req as any).orgId;
  
  if (!isUuid(completedJobId)) return res.status(400).json({ error: "Invalid completedJobId" });

  try {
    // Get the completed job details
    const completedJobResult: any = await db.execute(sql`
      SELECT * FROM completed_jobs
      WHERE id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
    `);

    if (completedJobResult.length === 0) {
      return res.status(404).json({ error: "Completed job not found" });
    }

    const completedJob = completedJobResult[0];
    
    // Look up equipment from completed_job_equipment (where it's stored after job completion)
    let equipmentInfo = null;
    
    // First try: Query completed_job_equipment (primary source after job completion)
    const completedEquipmentResult: any = await db.execute(sql`
      SELECT cje.equipment_name as name, e.make, e.model, e.serial
      FROM completed_job_equipment cje
      JOIN equipment e ON e.id = cje.equipment_id
      WHERE cje.completed_job_id = ${completedJobId}::uuid AND e.org_id = ${orgId}::uuid
      LIMIT 1
    `);
    
    if (completedEquipmentResult.length > 0) {
      equipmentInfo = completedEquipmentResult[0];
    } else if (completedJob.original_job_id) {
      // Fallback: Try job_equipment (for backward compatibility with older completed jobs)
      const equipmentResult: any = await db.execute(sql`
        SELECT e.name, e.make, e.model, e.serial
        FROM job_equipment je
        JOIN equipment e ON e.id = je.equipment_id
        WHERE je.job_id = ${completedJob.original_job_id}::uuid AND e.org_id = ${orgId}::uuid
        LIMIT 1
      `);
      
      if (equipmentResult.length > 0) {
        equipmentInfo = equipmentResult[0];
      }
    }

    // Check if customer exists
    if (!completedJob.customer_id) {
      return res.status(400).json({ error: "Cannot create invoice: job has no customer" });
    }

    // Generate invoice title based on equipment or job title
    let invoiceTitle;
    if (equipmentInfo) {
      // Use equipment information for the title
      const equipmentParts = [
        equipmentInfo.name,
        equipmentInfo.make,
        equipmentInfo.model,
        equipmentInfo.serial
      ].filter(Boolean); // Remove null/empty values
      
      invoiceTitle = equipmentParts.length > 0 
        ? `Invoice for: ${equipmentParts.join(' - ')}`
        : `Invoice for: ${completedJob.title}`;
    } else {
      // Fallback to job title if no equipment found
      invoiceTitle = `Invoice for: ${completedJob.title}`;
    }
    
    // Check if already converted (idempotency guard) - check by job_id to allow multiple invoices for same equipment
    const existingInvoice: any = await db.execute(sql`
      SELECT id FROM invoices 
      WHERE org_id = ${orgId}::uuid 
      AND job_id = ${completedJob.original_job_id}::uuid
    `);

    if (existingInvoice.length > 0) {
      return res.status(400).json({ 
        error: "Invoice already exists for this completed job",
        invoiceId: existingInvoice[0].id 
      });
    }

    // Pre-fetch all item presets to avoid N+1 queries
    const allPresets: any = await db.execute(sql`
      SELECT name, unit_amount, tax_rate
      FROM item_presets
      WHERE org_id = ${orgId}::uuid
    `);

    // Build preset lookup maps
    const presetMap = new Map();
    let laborPreset = null;

    for (const preset of allPresets) {
      const lowerName = preset.name.toLowerCase();
      presetMap.set(lowerName, preset);
      
      // Find labour preset (Australian spelling first, prefer exact matches, then partial)
      if (!laborPreset && lowerName === 'labour') {
        laborPreset = preset;
      } else if (!laborPreset && lowerName === 'labor') {
        laborPreset = preset;
      } else if (!laborPreset && (lowerName.includes('labour') || lowerName.includes('labor') || lowerName.includes('hour'))) {
        laborPreset = preset;
      }
    }

    // Get individual note entries from completed job
    const noteEntries: any = await db.execute(sql`
      SELECT text, created_at
      FROM completed_job_notes
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    // Combine main job notes with individual note entries
    let combinedNotes = completedJob.notes || '';
    if (noteEntries.length > 0) {
      const noteTexts = noteEntries.map((note: any) => note.text).join('\n');
      combinedNotes = combinedNotes ? `${combinedNotes}\n\n${noteTexts}` : noteTexts;
    }

    // Generate next invoice number for this organization
    const lastInvoiceResult: any = await db.execute(sql`
      SELECT number FROM invoices 
      WHERE org_id = ${orgId}::uuid AND number IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    let nextNumber = 1;
    if (lastInvoiceResult.length > 0 && lastInvoiceResult[0].number) {
      // Extract number from format like "inv-0001"
      const match = lastInvoiceResult[0].number.match(/inv-(\d+)/i);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    
    const invoiceNumber = `inv-${nextNumber.toString().padStart(4, '0')}`;

    // Create invoice from completed job (notes go into invoice notes, not line items)
    const invoiceResult: any = await db.execute(sql`
      INSERT INTO invoices (org_id, customer_id, job_id, title, notes, number, status, sub_total, tax_total, grand_total)
      VALUES (
        ${orgId}::uuid, 
        ${completedJob.customer_id}::uuid,
        ${completedJob.original_job_id}::uuid,
        ${invoiceTitle},
        ${combinedNotes},
        ${invoiceNumber},
        'draft',
        0,
        0,
        0
      )
      RETURNING id
    `);

    const invoiceId = invoiceResult[0].id;
    let position = 0;
    const lineItems = [];

    // Add equipment as first line item if available
    if (equipmentInfo) {
      const equipmentParts = [
        equipmentInfo.name,
        equipmentInfo.make,
        equipmentInfo.model,
        equipmentInfo.serial
      ].filter(Boolean);
      
      const equipmentDescription = equipmentParts.join(' - ');
      
      // Add equipment line item with quantity 1, unit amount 0, and 10% tax
      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          ${position},
          ${equipmentDescription},
          1,
          0,
          0
        )
      `);
      
      lineItems.push({ quantity: 1, unit_amount: 0, tax_rate: 0 });
      position++;
    }

    // Get job charges and add them as line items
    const charges: any = await db.execute(sql`
      SELECT kind, description, quantity, unit_price, total
      FROM completed_job_charges
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const charge of charges) {
      const quantity = Number(charge.quantity) || 1;
      const unitAmount = Number(charge.unit_price) || 0;
      const taxRate = 10; // 10% as percentage

      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          ${position},
          ${charge.description},
          ${quantity},
          ${unitAmount},
          ${taxRate}
        )
      `);

      lineItems.push({ quantity, unit_amount: unitAmount, tax_rate: taxRate });
      position++;
    }

    // Get job hours and add them as line items with preset pricing lookup
    const hours: any = await db.execute(sql`
      SELECT hours, description
      FROM completed_job_hours
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const hour of hours) {
      const quantity = Number(hour.hours) || 1;
      const unitAmount = Number(laborPreset?.unit_amount) || 0;
      const taxRate = Number(laborPreset?.tax_rate) || 10; // Default 10% if no preset

      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          ${position},
          ${hour.description || 'Labor Hours'},
          ${quantity},
          ${unitAmount},
          ${taxRate}
        )
      `);

      lineItems.push({ quantity, unit_amount: unitAmount, tax_rate: taxRate });
      position++;
    }

    // Get job parts and add them as line items with preset pricing lookup
    const parts: any = await db.execute(sql`
      SELECT part_name, quantity
      FROM completed_job_parts
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const part of parts) {
      const partName = part.part_name?.trim();
      if (!partName) continue; // Skip null/empty part names

      const quantity = Number(part.quantity) || 1;
      const preset = presetMap.get(partName.toLowerCase());
      const unitAmount = Number(preset?.unit_amount) || 0;
      const taxRate = Number(preset?.tax_rate) || 10; // Default 10% if no preset

      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          ${position},
          ${partName},
          ${quantity},
          ${unitAmount},
          ${taxRate}
        )
      `);

      lineItems.push({ quantity, unit_amount: unitAmount, tax_rate: taxRate });
      position++;
    }

    // If no charges, hours, or parts were found, add a default line item
    if (charges.length === 0 && hours.length === 0 && parts.length === 0) {
      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          0,
          ${completedJob.description || `Work completed: ${completedJob.title}`},
          1,
          0,
          10
        )
      `);
      lineItems.push({ quantity: 1, unit_amount: 0, tax_rate: 10 });
    }

    // Calculate totals using the sumLines utility
    const { sumLines } = await import("../lib/totals.js");
    const { sub_total, tax_total, grand_total } = sumLines(lineItems);

    // Update invoice with calculated totals
    await db.execute(sql`
      UPDATE invoices 
      SET sub_total = ${sub_total}, tax_total = ${tax_total}, grand_total = ${grand_total}
      WHERE id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid
    `);

    res.json({ 
      ok: true, 
      invoiceId: invoiceId,
      message: `Invoice created successfully with ${position} line items. Total: $${grand_total.toFixed(2)}`
    });

  } catch (e: any) {
    console.error("POST /api/jobs/completed/:completedJobId/convert-to-invoice error:", e);
    res.status(500).json({ error: e?.message || "Failed to convert to invoice" });
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

/* DELETE COMPLETED JOB */
jobs.delete("/completed/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] DELETE /api/jobs/completed/%s org=%s", jobId, orgId);
  
  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  try {
    // Get photos to delete from object storage
    const photosResult: any = await db.execute(sql`
      SELECT url FROM completed_job_photos 
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);
    
    // Delete photos from object storage
    if (photosResult && photosResult.length > 0) {
      for (const photo of photosResult) {
        const photoUrl = photo.url;
        
        // Delete from object storage if it's an object storage URL
        if (photoUrl && photoUrl.startsWith('/objects/')) {
          try {
            const objectName = photoUrl.replace('/objects/', '');
            let privateDir = process.env.PRIVATE_OBJECT_DIR;
            
            if (privateDir) {
              // Normalize to ensure leading slash
              if (!privateDir.startsWith('/')) {
                privateDir = `/${privateDir}`;
              }
              
              const bucketMatch = privateDir.match(/^\/([^\/]+)/);
              if (bucketMatch) {
                const bucketName = bucketMatch[1];
                const { objectStorageClient } = await import("../objectStorage");
                const bucket = objectStorageClient.bucket(bucketName);
                const fileObj = bucket.file(objectName);
                
                // Check if file exists before deleting
                const [exists] = await fileObj.exists();
                if (exists) {
                  await fileObj.delete();
                  console.log("[TRACE] Deleted object from storage during completed job deletion: %s", objectName);
                }
              }
            }
          } catch (storageError: any) {
            console.error("Error deleting photo from object storage:", photoUrl, storageError);
            // Continue with other deletions even if one fails
          }
        }
      }
    }

    // Delete all related completed job records
    await db.execute(sql`DELETE FROM completed_job_charges WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_hours WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_parts WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_notes WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_photos WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_equipment WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    
    // Delete the completed job itself
    await db.execute(sql`
      DELETE FROM completed_jobs
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/jobs/completed/%s error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to delete completed job" });
  }
});



export default jobs;