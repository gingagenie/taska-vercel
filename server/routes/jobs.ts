// server/routes/jobs.ts
import { Router } from "express";
import multer from "multer";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { uploadPdfToDriveFolder } from "../services/googleDrive";

import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";

export const jobs = Router();
export default jobs;

function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

function normalizeScheduledAt(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === "string" && /Z$/.test(raw)) return raw;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const localDate = new Date(raw + ":00");
    const utcDate = new Date(localDate.getTime() - 10 * 60 * 60 * 1000);
    if (!isNaN(utcDate.valueOf())) return utcDate.toISOString();
  }
  return raw;
}

async function requirePortalOrStaff(req: any, res: any, next: any) {
  if (req.session?.userId && req.session?.orgId) {
    req.orgId = req.session.orgId;
    req.user = { id: req.session.userId };
    req.isPortal = false;
    return next();
  }

  const customerId =
    req.session?.portalCustomerId ||
    req.session?.customerId ||
    req.session?.customer?.id ||
    req.session?.portal?.customerId ||
    req.session?.portal?.customer?.id ||
    req.session?.portalCustomer?.id ||
    req.session?.portalSession?.customerId ||
    req.session?.portalSession?.customer?.id ||
    null;

  if (!customerId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const completedJobId = req.params?.completedJobId || req.params?.jobId;
  if (!completedJobId || !isUuid(completedJobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    const r: any = await db.execute(sql`
      SELECT org_id, customer_id
      FROM completed_jobs
      WHERE id = ${completedJobId}::uuid
      LIMIT 1
    `);

    if (!r?.length) {
      return res.status(404).json({ error: "Completed job not found" });
    }

    const jobCustomerId = r[0].customer_id;
    if (jobCustomerId && String(jobCustomerId) !== String(customerId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.orgId = r[0].org_id;
    req.customerId = customerId;
    req.isPortal = true;
    return next();
  } catch (e: any) {
    console.error("[requirePortalOrStaff] error:", e);
    return res.status(500).json({ error: e?.message || "Auth failed" });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/heic-sequence",
    ];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error("Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC/HEIF)"));
  },
});

jobs.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

jobs.get(
  "/equipment",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
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
  }
);

jobs.get(
  "/completed",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const orgId = (req as any).orgId;

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
        LEFT JOIN completed_job_photos cjp
          ON cjp.completed_job_id = cj.id AND cjp.org_id = cj.org_id
        LEFT JOIN invoices inv
          ON inv.job_id = cj.original_job_id AND inv.org_id = cj.org_id
        WHERE cj.org_id = ${orgId}::uuid
        GROUP BY cj.id, cj.original_job_id, cj.customer_id, cj.customer_name, cj.title, 
                 cj.description, cj.notes, cj.scheduled_at, cj.completed_at, cj.completed_by,
                 cj.original_created_by, cj.original_created_at, inv.id
        ORDER BY cj.completed_at DESC
      `);

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      res.json(r);
    } catch (e: any) {
      console.error("GET /api/jobs/completed error:", e);
      res.status(500).json({ error: e?.message || "Failed to fetch completed jobs" });
    }
  }
);

jobs.get("/completed/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  try {
    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

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

    if (r.length === 0) return res.status(404).json({ error: "Completed job not found" });

    res.json(r[0]);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job" });
  }
});

jobs.get("/completed/:jobId/notes", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  try {
    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

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

jobs.get("/completed/:jobId/photos", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  try {
    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const r: any = await db.execute(sql`
      SELECT id, url, created_at
      FROM completed_job_photos
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC
    `);

    const { createSignedViewUrl } = await import("../services/supabase-storage");

    const photos = await Promise.all(
      (r as any[]).map(async (photo) => {
        if (photo.url && typeof photo.url === "string" && photo.url.startsWith("org/")) {
          const signedUrl = await createSignedViewUrl(photo.url, 900);
          return { ...photo, url: signedUrl || photo.url };
        }
        return photo;
      })
    );

    res.json(photos);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s/photos error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job photos" });
  }
});

jobs.get("/completed/:jobId/equipment", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  try {
    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

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

jobs.get(
  
 // Replace the entire service sheet endpoint (starting around line 400) with this optimized version:

jobs.get(
  "/completed/:completedJobId/service-sheet",
  requirePortalOrStaff,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const { completedJobId } = req.params;
    const orgId = (req as any).orgId;

    if (!isUuid(completedJobId)) return res.status(400).json({ error: "Invalid completedJobId" });

    try {
      // Check if we have a pre-generated PDF in storage
      const completedJobRows: any = await db.execute(sql`
        SELECT service_sheet_pdf_key
        FROM completed_jobs
        WHERE id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
        LIMIT 1
      `);

      if (!completedJobRows?.length) {
        return res.status(404).json({ error: "Completed job not found" });
      }

      const pdfKey = completedJobRows[0].service_sheet_pdf_key;

      // If we have a stored PDF, serve it directly (FAST PATH)
      if (pdfKey) {
        console.log(`[PDF] Serving pre-generated PDF from storage: ${pdfKey}`);
        
        const { createSignedViewUrl } = await import("../services/supabase");
        const signedUrl = await createSignedViewUrl(pdfKey, 900); // 15 min expiry

        if (signedUrl) {
          // Redirect to the signed URL - browser downloads directly from Supabase
          return res.redirect(signedUrl);
        } else {
          console.warn(`[PDF] Failed to create signed URL for ${pdfKey}, falling back to generation`);
        }
      }

      // SLOW PATH: Generate PDF on-demand (for old jobs that don't have stored PDFs)
      console.log(`[PDF] No stored PDF found, generating on-demand for ${completedJobId}`);
      
      const { generateServiceSheetPDF } = await import('../lib/service-sheet-generator');
      const pdfBuffer = await generateServiceSheetPDF(completedJobId, orgId);

      const filename = `service-sheet-${completedJobId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);

    } catch (e: any) {
      console.error("GET /api/jobs/completed/:completedJobId/service-sheet error:", e);
      res.status(500).json({ error: e?.message || "Failed to generate service sheet" });
    }
  }
);

jobs.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;

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
      } catch {
        job.technicians = [];
      }

      try {
        const equipmentResult: any = await db.execute(sql`
          select e.id, e.name
          from job_equipment je
          join equipment e on e.id = je.equipment_id
          where je.job_id = ${job.id}
          order by e.name
        `);
        job.equipment = equipmentResult || [];
      } catch {
        job.equipment = [];
      }
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

jobs.get("/technicians", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;

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

jobs.get("/range", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  const { start, end, techId } = req.query as { start?: string; end?: string; techId?: string };

  if (!start || !end) return res.status(400).json({ error: "start and end are required (ISO strings)" });

  try {
    let query = sql``;

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
      } catch {
        job.technicians = [];
      }
    }

    res.json(r);
  } catch (error: any) {
    console.error("GET /api/jobs/range error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch jobs" });
  }
});

jobs.get("/customers", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
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

jobs.get("/:jobId", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;

    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

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

    if (!jr || jr.length === 0) return res.status(404).json({ error: "Job not found" });

    const job = jr[0];

    try {
      const techniciansResult: any = await db.execute(sql`
        select u.id, u.name, u.email, u.color
        from job_assignments ja
        join users u on u.id = ja.user_id
        where ja.job_id = ${jobId}
        order by u.name
      `);
      job.technicians = techniciansResult || [];
    } catch {
      job.technicians = [];
    }

    try {
      const equipmentResult: any = await db.execute(sql`
        select e.id, e.name, e.make, e.model
        from job_equipment je
        join equipment e on e.id = je.equipment_id
        where je.job_id = ${jobId}
        order by e.name
      `);
      job.equipment = equipmentResult || [];
    } catch {
      job.equipment = [];
    }

    res.json(job);
  } catch (error: any) {
    console.error("GET /api/jobs/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch job" });
  }
});

jobs.post("/create", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id || null;

  let { title, description, jobType, customerId, scheduledAt, equipmentId, assignedTechIds } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  if (customerId === "") customerId = null;
  if (equipmentId === "") equipmentId = null;
  if (jobType === "") jobType = null;

  const scheduled = normalizeScheduledAt(scheduledAt);

  try {
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

jobs.patch("/:jobId/schedule", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const { scheduledAt } = req.body || {};

  if (!jobId || !isUuid(jobId)) return res.status(400).json({ error: "invalid jobId" });
  if (!scheduledAt) return res.status(400).json({ error: "scheduledAt required (ISO)" });

  await db.execute(sql`
    update jobs set scheduled_at = ${scheduledAt}::timestamptz
    where id=${jobId}::uuid and org_id=${orgId}::uuid
  `);

  res.json({ ok: true });
});

jobs.put("/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  let { title, description, status, scheduledAt, customerId, assignedUserId } = req.body || {};
  if (customerId === "") customerId = null;
  if (assignedUserId === "") assignedUserId = null;

  const scheduled = normalizeScheduledAt(scheduledAt);

  try {
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

    if (!result.length) return res.status(404).json({ error: "Job not found" });

    if (assignedUserId) {
      if (!isUuid(assignedUserId)) return res.status(400).json({ error: "Invalid assignedUserId format" });

      const userCheck: any = await db.execute(sql`
        SELECT 1 FROM users 
        WHERE id = ${assignedUserId}::uuid AND org_id = ${orgId}::uuid
      `);

      if (!userCheck.length) {
        return res.status(400).json({ error: "Invalid user assignment - user not found in organization" });
      }
    }

    await db.execute(sql`DELETE FROM job_assignments WHERE job_id = ${jobId}::uuid`);

    if (assignedUserId) {
      await db.execute(sql`
        INSERT INTO job_assignments (job_id, user_id)
        VALUES (${jobId}::uuid, ${assignedUserId}::uuid)
        ON CONFLICT DO NOTHING
      `);
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/jobs/%s error:", jobId, error);
    res.status(500).json({ error: error?.message || "Update failed" });
  }
});

jobs.get("/:jobId/photos", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;

    if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid job ID format" });

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

jobs.post(
  "/:jobId/photos",
  requireAuth,
  requireOrg,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File size exceeds 10MB limit" });
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ error: err.message || "Invalid file type" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const orgId = (req as any).orgId;
      const userId = (req as any).user?.id;

      if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid job ID format" });

      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file provided" });
      if (!file.buffer) return res.status(500).json({ error: "File buffer not available" });

      let ext = "jpg";
      if (file.originalname && file.originalname.includes(".")) {
        const parts = file.originalname.split(".");
        const rawExt = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "");
        const mimeToExt: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/png": "png",
          "image/gif": "gif",
          "image/webp": "webp",
          "image/heic": "heic",
          "image/heif": "heif",
          "image/heic-sequence": "heic",
        };
        ext = mimeToExt[file.mimetype] || rawExt || "jpg";
      }

      const jobCheck: any = await db.execute(sql`
        SELECT id FROM jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid
      `);
      if (jobCheck.length === 0) return res.status(404).json({ error: "Job not found" });

      try {
        const { uploadPhotoToSupabase } = await import("../services/supabase-storage");

        const uploadResult = await uploadPhotoToSupabase({
          tenantId: orgId,
          jobId,
          ext,
          fileBuffer: file.buffer,
          contentType: file.mimetype,
        });

        const result = await db.execute(sql`
          INSERT INTO job_photos (job_id, org_id, url, object_key)
          VALUES (${jobId}::uuid, ${orgId}::uuid, ${uploadResult.key}, ${uploadResult.key})
          RETURNING id, url, object_key, created_at
        `);

        return res.json(result[0]);
      } catch (supabaseError: any) {
        console.warn(`[PHOTO_UPLOAD] Supabase upload failed, falling back:`, supabaseError?.message);

        const { jobPhotoKey, absolutePathForKey, disableObjectStorage } = await import("../storage/paths");
        const { logStorage } = await import("../storage/log");
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const timestamp = Date.now();
        const safeName = `${timestamp}-${file.originalname?.replace(/\s+/g, "_") || "upload"}.${ext}`;
        const key = jobPhotoKey(orgId, jobId, safeName);
        let absolutePath = absolutePathForKey(key);

        try {
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, file.buffer);
          logStorage("UPLOAD", { who: userId, key });
        } catch (uploadError: any) {
          if (uploadError?.code === "ENOENT" || uploadError?.code === "EACCES") {
            disableObjectStorage();
            absolutePath = absolutePathForKey(key);
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, file.buffer);
            logStorage("UPLOAD", { who: userId, key, storage: "local fallback (after failure)" });
          } else {
            throw uploadError;
          }
        }

        const url = `/api/objects/${key}`;
        const result = await db.execute(sql`
          INSERT INTO job_photos (job_id, org_id, url, object_key)
          VALUES (${jobId}::uuid, ${orgId}::uuid, ${url}, ${key})
          RETURNING id, url, object_key, created_at
        `);

        res.json(result[0]);
      }
    } catch (error: any) {
      console.error("POST /api/jobs/%s/photos error:", req.params.jobId, error);
      res.status(500).json({ error: error?.message || "Failed to upload photo" });
    }
  }
);

jobs.delete("/:jobId/photos/:photoId", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId, photoId } = req.params;
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;

    if (!isUuid(jobId) || !isUuid(photoId)) return res.status(400).json({ error: "Invalid job or photo ID format" });

    const photoResult = await db.execute(sql`
      SELECT object_key, url FROM job_photos 
      WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);

    if (photoResult.length > 0) {
      const photo = photoResult[0] as any;
      const key = photo.object_key || photo.url?.replace("/objects/", "");
      if (key) {
        try {
          if (typeof key === "string" && key.startsWith("org/")) {
            const { deleteFile } = await import("../services/supabase-storage");
            await deleteFile(key);
          } else {
            const { absolutePathForKey, disableObjectStorage } = await import("../storage/paths");
            const { logStorage } = await import("../storage/log");
            const fs = await import("node:fs/promises");

            let absolutePath = absolutePathForKey(key);

            try {
              await fs.unlink(absolutePath);
              logStorage("DELETE", { who: userId, key });
            } catch (deleteError: any) {
              if (deleteError?.code === "ENOENT" || deleteError?.code === "EACCES") {
                disableObjectStorage();
                absolutePath = absolutePathForKey(key);
                await fs.unlink(absolutePath);
                logStorage("DELETE", { who: userId, key, storage: "local fallback (after failure)" });
              } else {
                throw deleteError;
              }
            }
          }
        } catch (storageError: any) {
          console.error("Error deleting from storage:", storageError);
        }
      }
    }

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
      set notes = ${notes || ""}, updated_at = now()
      where id = ${jobId}::uuid and org_id = ${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/jobs/:jobId/notes error:", e);
    res.status(500).json({ error: e?.message || "Failed to save notes" });
  }
});

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

jobs.post("/:jobId/hours", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const { hours, description } = req.body;
  const orgId = (req as any).orgId;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });
  if (!hours || typeof hours !== "number" || hours % 0.5 !== 0) {
    return res.status(400).json({ error: "Hours must be in 0.5 increments" });
  }

  try {
    const r: any = await db.execute(sql`
      INSERT INTO job_hours (job_id, org_id, hours, description)
      VALUES (${jobId}::uuid, ${orgId}::uuid, ${hours}, ${description || ""})
      RETURNING id, hours, description, created_at
    `);
    res.json(r[0]);
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/hours error:", e);
    res.status(500).json({ error: e?.message || "Failed to add hours" });
  }
});

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

jobs.post("/:jobId/parts", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const { partName, quantity } = req.body;
  const orgId = (req as any).orgId;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });
  if (!partName || typeof partName !== "string") return res.status(400).json({ error: "Part name is required" });
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

jobs.post("/:jobId/complete", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  try {
    const jobResult: any = await db.execute(sql`
      SELECT j.*, c.name as customer_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      WHERE j.id = ${jobId}::uuid AND j.org_id = ${orgId}::uuid
    `);

    if (jobResult.length === 0) return res.status(404).json({ error: "Job not found" });

    const job = jobResult[0];

    const completedResult: any = await db.execute(sql`
      INSERT INTO completed_jobs (
        org_id, original_job_id, customer_id, customer_name, title, description, job_type, notes,
        scheduled_at, completed_by, original_created_by, original_created_at
      )
      VALUES (
        ${orgId}::uuid, ${jobId}::uuid, ${job.customer_id}::uuid, ${job.customer_name},
        ${job.title}, ${job.description}, ${job.job_type}, ${job.notes},
        ${job.scheduled_at}, ${userId}, ${job.created_by}, ${job.created_at}
      )
      RETURNING id, completed_at
    `);

    const completedJobId = completedResult[0].id;

    await db.execute(sql`
      INSERT INTO completed_job_charges (
        completed_job_id, original_job_id, org_id, kind, description, quantity, unit_price, total, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
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

    await db.execute(sql`
      INSERT INTO completed_job_hours (
        completed_job_id, original_job_id, org_id, hours, description, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
        ${jobId}::uuid,
        org_id,
        hours,
        description,
        created_at
      FROM job_hours
      WHERE job_id = ${jobId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO completed_job_parts (
        completed_job_id, original_job_id, org_id, part_name, quantity, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
        ${jobId}::uuid,
        org_id,
        part_name,
        quantity,
        created_at
      FROM job_parts
      WHERE job_id = ${jobId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO completed_job_notes (
        completed_job_id, original_job_id, org_id, text, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
        ${jobId}::uuid,
        org_id,
        text,
        created_at
      FROM job_notes
      WHERE job_id = ${jobId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO completed_job_photos (
        completed_job_id, original_job_id, org_id, url, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
        ${jobId}::uuid,
        org_id,
        url,
        created_at
      FROM job_photos
      WHERE job_id = ${jobId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO completed_job_equipment (
        completed_job_id, original_job_id, org_id, equipment_id, equipment_name, created_at
      )
      SELECT 
        ${completedJobId}::uuid,
        ${jobId}::uuid,
        ${orgId}::uuid,
        je.equipment_id,
        e.name,
        je.created_at
      FROM job_equipment je
      LEFT JOIN equipment e ON je.equipment_id = e.id
      WHERE je.job_id = ${jobId}::uuid
    `);

   // Replace the GOOGLE DRIVE UPLOAD section with this:

    // GENERATE AND STORE SERVICE SHEET PDF
    let servicePdfKey: string | null = null;
    try {
      const { generateServiceSheetPDF } = await import('../lib/service-sheet-generator');
      const { uploadFileToSupabase } = await import('../services/supabase');
      
      console.log(`[PDF] Generating service sheet for job ${completedJobId}...`);
      const pdfBuffer = await generateServiceSheetPDF(completedJobId, orgId);
      
      console.log(`[PDF] Uploading to Supabase Storage...`);
      const { key } = await uploadFileToSupabase({
        tenantId: orgId,
        jobId: completedJobId,
        ext: 'pdf',
        fileBuffer: pdfBuffer,
        contentType: 'application/pdf',
        folder: 'service-sheets',
      });
      
      servicePdfKey = key;
      console.log(`✅ Service sheet PDF stored: ${key}`);
      
      // Update completed_jobs with the PDF key
      await db.execute(sql`
        UPDATE completed_jobs 
        SET service_sheet_pdf_key = ${servicePdfKey}
        WHERE id = ${completedJobId}::uuid
      `);
      
    } catch (err: any) {
      console.error('⚠️ Service sheet PDF generation/upload failed:', err?.message);
      // Non-fatal - job completion continues
    }

    // OPTIONAL: GOOGLE DRIVE UPLOAD (keep if you want both)
    try {
      const equipmentRows: any = await db.execute(sql`
        SELECT e.id, e.name, e.google_drive_folder_id
        FROM job_equipment je
        JOIN equipment e ON e.id = je.equipment_id
        WHERE je.job_id = ${jobId}::uuid
        LIMIT 1
      `);

      if (equipmentRows.length > 0) {
        const equip = equipmentRows[0];
        const { uploadServiceSheet } = await import('../services/googleDrive');
        const { generateServiceSheetPDF } = await import('../lib/service-sheet-generator');
        
        // Re-use the already generated PDF buffer if available, otherwise generate again
        let pdfBuffer: Buffer;
        if (servicePdfKey) {
          // We already generated it above, but we need the buffer for Drive
          // Option 1: Generate again (simpler but slower)
          pdfBuffer = await generateServiceSheetPDF(completedJobId, orgId);
        } else {
          pdfBuffer = await generateServiceSheetPDF(completedJobId, orgId);
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        
        const { folderId } = await uploadServiceSheet({
          equipmentName: equip.name,
          pdfBuffer,
          date: dateStr,
          existingFolderId: equip.google_drive_folder_id,
        });
        
        if (!equip.google_drive_folder_id) {
          await db.execute(sql`
            UPDATE equipment SET google_drive_folder_id = ${folderId} WHERE id = ${equip.id}::uuid
          `);
        }
        
        console.log(`✅ Service sheet uploaded to Drive: ${equip.name} - ${dateStr}.pdf`);
      }
    } catch (err) {
      console.error('⚠️ Drive upload failed:', err);
      // Non-fatal
    }

          await db.execute(sql`
            UPDATE equipment SET google_drive_folder_id = ${folderId} WHERE id = ${equip.id}::uuid
          `);
        }
        
        console.log(`✅ Service sheet uploaded: ${equip.name} - ${dateStr}.pdf`);
      }
    } catch (err) {
      console.error('⚠️ Drive upload failed:', err);
    }

    await db.execute(sql`DELETE FROM job_notifications WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_assignments WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_equipment WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_photos WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_hours WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_notes WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_parts WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_charges WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);

    res.json({
      ok: true,
      completed_job_id: completedJobId,
      completed_at: completedResult[0].completed_at,
    });
  } catch (e: any) {
    console.error("POST /api/jobs/:jobId/complete error:", e);
    res.status(500).json({ error: e?.message || "Failed to complete job" });
  }
});

jobs.post("/completed/:completedJobId/convert-to-invoice", requireAuth, requireOrg, async (req, res) => {
  const { completedJobId } = req.params;
  const orgId = (req as any).orgId;

  if (!isUuid(completedJobId)) return res.status(400).json({ error: "Invalid completedJobId" });

  try {
    const completedJobResult: any = await db.execute(sql`
      SELECT * FROM completed_jobs
      WHERE id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
    `);

    if (completedJobResult.length === 0) return res.status(404).json({ error: "Completed job not found" });

    const completedJob = completedJobResult[0];
    if (!completedJob.customer_id) return res.status(400).json({ error: "Cannot create invoice: job has no customer" });

    let equipmentInfo = null;
    const completedEquipmentResult: any = await db.execute(sql`
      SELECT cje.equipment_name as name, e.make, e.model, e.serial
      FROM completed_job_equipment cje
      JOIN equipment e ON e.id = cje.equipment_id
      WHERE cje.completed_job_id = ${completedJobId}::uuid AND e.org_id = ${orgId}::uuid
      LIMIT 1
    `);
    if (completedEquipmentResult.length > 0) equipmentInfo = completedEquipmentResult[0];

    let invoiceTitle;
    if (equipmentInfo) {
      const equipmentParts = [equipmentInfo.name, equipmentInfo.make, equipmentInfo.model, equipmentInfo.serial].filter(Boolean);
      invoiceTitle = equipmentParts.length > 0 ? `Invoice for: ${equipmentParts.join(" - ")}` : `Invoice for: ${completedJob.title}`;
    } else {
      invoiceTitle = `Invoice for: ${completedJob.title}`;
    }

    const existingInvoice: any = await db.execute(sql`
      SELECT id FROM invoices 
      WHERE org_id = ${orgId}::uuid 
      AND job_id = ${completedJob.original_job_id}::uuid
    `);
    if (existingInvoice.length > 0) {
      return res.status(400).json({
        error: "Invoice already exists for this completed job",
        invoiceId: existingInvoice[0].id,
      });
    }

    const allPresets: any = await db.execute(sql`
      SELECT name, unit_amount, tax_rate
      FROM item_presets
      WHERE org_id = ${orgId}::uuid
    `);

    const presetMap = new Map<string, any>();
    let laborPreset: any = null;
    for (const preset of allPresets) {
      const lowerName = String(preset.name || "").toLowerCase();
      presetMap.set(lowerName, preset);
      if (!laborPreset && (lowerName === "labour" || lowerName === "labor" || lowerName.includes("hour"))) laborPreset = preset;
    }

    const noteEntries: any = await db.execute(sql`
      SELECT text, created_at
      FROM completed_job_notes
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    let combinedNotes = completedJob.notes || "";
    if (noteEntries.length > 0) {
      const noteTexts = noteEntries.map((n: any) => n.text).join("\n");
      combinedNotes = combinedNotes ? `${combinedNotes}\n\n${noteTexts}` : noteTexts;
    }

    const lastInvoiceResult: any = await db.execute(sql`
      SELECT number FROM invoices 
      WHERE org_id = ${orgId}::uuid AND number IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    let nextNumber = 1;
    if (lastInvoiceResult.length > 0 && lastInvoiceResult[0].number) {
      const match = String(lastInvoiceResult[0].number).match(/inv-(\d+)/i);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }
    const invoiceNumber = `inv-${nextNumber.toString().padStart(4, "0")}`;

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
    const lineItems: any[] = [];

    if (equipmentInfo) {
      const equipmentParts = [equipmentInfo.name, equipmentInfo.make, equipmentInfo.model, equipmentInfo.serial].filter(Boolean);
      const equipmentDescription = equipmentParts.join(" - ");

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

    const charges: any = await db.execute(sql`
      SELECT kind, description, quantity, unit_price, total
      FROM completed_job_charges
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const charge of charges) {
      const quantity = Number(charge.quantity) || 1;
      const unitAmount = Number(charge.unit_price) || 0;
      const taxRate = 10;

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

    const hours: any = await db.execute(sql`
      SELECT hours, description
      FROM completed_job_hours
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const hour of hours) {
      const quantity = Number(hour.hours) || 1;
      const unitAmount = Number(laborPreset?.unit_amount) || 0;
      const taxRate = Number(laborPreset?.tax_rate) || 10;

      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (
          ${orgId}::uuid,
          ${invoiceId}::uuid,
          ${position},
          ${hour.description || "Labor Hours"},
          ${quantity},
          ${unitAmount},
          ${taxRate}
        )
      `);

      lineItems.push({ quantity, unit_amount: unitAmount, tax_rate: taxRate });
      position++;
    }

    const parts: any = await db.execute(sql`
      SELECT part_name, quantity
      FROM completed_job_parts
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    for (const part of parts) {
      const partName = String(part.part_name || "").trim();
      if (!partName) continue;

      const quantity = Number(part.quantity) || 1;
      const preset = presetMap.get(partName.toLowerCase());
      const unitAmount = Number(preset?.unit_amount) || 0;
      const taxRate = Number(preset?.tax_rate) || 10;

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
      position = 1;
    }

    const { sumLines } = await import("../lib/totals.js");
    const { sub_total, tax_total, grand_total } = sumLines(lineItems);

    await db.execute(sql`
      UPDATE invoices 
      SET sub_total = ${sub_total}, tax_total = ${tax_total}, grand_total = ${grand_total}
      WHERE id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid
    `);

    res.json({
      ok: true,
      invoiceId,
      message: `Invoice created successfully with ${position} line items. Total: $${grand_total.toFixed(2)}`,
    });
  } catch (e: any) {
    console.error("POST /api/jobs/completed/:completedJobId/convert-to-invoice error:", e);
    res.status(500).json({ error: e?.message || "Failed to convert to invoice" });
  }
});

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

jobs.delete("/completed/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  try {
    await db.execute(sql`DELETE FROM completed_job_charges WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_hours   WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_parts   WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_notes   WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_photos  WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_equipment WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);

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
