import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import multer from "multer";
import { uploadFileToSupabase } from "../services/supabase";

const router = Router();

// Multer for photo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed"));
    }
  },
});

/* ------------------------ GET: List Service Requests --------------------- */

router.get("/", async (req, res) => {
  const orgId = req.session?.orgId;
  if (!orgId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const { status, urgency } = req.query;

    let query = sql`
      SELECT 
        sr.*,
        (
          SELECT json_agg(json_build_object('id', id, 'url', url, 'created_at', created_at))
          FROM service_request_photos
          WHERE service_request_id = sr.id
        ) as photos
      FROM service_requests sr
      WHERE sr.org_id = ${orgId}::uuid
    `;

    // Add filters
    if (status) {
      query = sql`${query} AND sr.status = ${status}`;
    }
    if (urgency) {
      query = sql`${query} AND sr.urgency = ${urgency}`;
    }

    query = sql`${query} ORDER BY sr.created_at DESC`;

    const requests: any = await db.execute(query);

    res.json(requests || []);
  } catch (error: any) {
    console.error("Error fetching service requests:", error);
    res.status(500).json({ error: "Failed to fetch service requests" });
  }
});

/* ----------------------- GET: Single Service Request --------------------- */

router.get("/:id", async (req, res) => {
  const orgId = req.session?.orgId;
  if (!orgId) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.params;

  try {
    const result: any = await db.execute(sql`
      SELECT 
        sr.*,
        (
          SELECT json_agg(json_build_object('id', id, 'url', url, 'created_at', created_at))
          FROM service_request_photos
          WHERE service_request_id = sr.id
        ) as photos
      FROM service_requests sr
      WHERE sr.id = ${id}::uuid AND sr.org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Service request not found" });
    }

    res.json(result[0]);
  } catch (error: any) {
    console.error("Error fetching service request:", error);
    res.status(500).json({ error: "Failed to fetch service request" });
  }
});

/* -------------------- POST: Create Service Request (Portal) -------------- */

router.post("/", upload.array("photos", 5), async (req, res) => {
  // This endpoint is for CUSTOMERS creating requests from the portal
  // We'll use a different auth mechanism for portal users
  
  const { 
    customer_id, 
    equipment_id, 
    title, 
    description, 
    urgency = 'normal',
    customer_name,
    customer_email,
    customer_phone,
    equipment_name,
    org_id // Passed from portal
  } = req.body;

  if (!org_id || !title || !description) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Create service request
    const result: any = await db.execute(sql`
      INSERT INTO service_requests (
        org_id,
        customer_id,
        equipment_id,
        title,
        description,
        urgency,
        customer_name,
        customer_email,
        customer_phone,
        equipment_name
      ) VALUES (
        ${org_id}::uuid,
        ${customer_id || null}::uuid,
        ${equipment_id || null}::uuid,
        ${title},
        ${description},
        ${urgency},
        ${customer_name || null},
        ${customer_email || null},
        ${customer_phone || null},
        ${equipment_name || null}
      )
      RETURNING id
    `);

    const serviceRequestId = result[0].id;

    // Upload photos if provided
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const { key } = await uploadFileToSupabase({
            tenantId: org_id,
            jobId: serviceRequestId,
            ext: file.originalname.split('.').pop() || 'jpg',
            fileBuffer: file.buffer,
            contentType: file.mimetype,
            folder: 'service-request-photos',
          });

          // Create signed URL
          const { createSignedViewUrl } = await import("../services/supabase-storage");
          const photoUrl = await createSignedViewUrl(key, 60 * 60 * 24 * 365); // 1 year

          // Save photo reference
          await db.execute(sql`
            INSERT INTO service_request_photos (service_request_id, org_id, url)
            VALUES (${serviceRequestId}::uuid, ${org_id}::uuid, ${photoUrl})
          `);
        } catch (photoError) {
          console.error("Failed to upload photo:", photoError);
          // Continue even if photo upload fails
        }
      }
    }

    // TODO: Send notification to admin (email, push, etc.)

    res.json({ 
      success: true, 
      id: serviceRequestId,
      message: "Service request submitted successfully" 
    });
  } catch (error: any) {
    console.error("Error creating service request:", error);
    res.status(500).json({ error: "Failed to create service request" });
  }
});

/* ---------------------- PUT: Update Service Request ---------------------- */

router.put("/:id", async (req, res) => {
  const orgId = req.session?.orgId;
  if (!orgId) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.params;
  const { status, admin_notes } = req.body;

  try {
    // Mark as viewed if changing from pending
    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      updates.push(`status = $${values.length + 1}`);
      values.push(status);

      if (status === 'viewed') {
        updates.push(`viewed_at = NOW()`);
      }
    }

    if (admin_notes !== undefined) {
      updates.push(`admin_notes = $${values.length + 1}`);
      values.push(admin_notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    await db.execute(sql.raw(`
      UPDATE service_requests
      SET ${updates.join(', ')}
      WHERE id = '${id}' AND org_id = '${orgId}'
    `));

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating service request:", error);
    res.status(500).json({ error: "Failed to update service request" });
  }
});

/* ---------------------- DELETE: Delete Service Request ------------------- */

router.delete("/:id", async (req, res) => {
  const orgId = req.session?.orgId;
  if (!orgId) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.params;

  try {
    console.log(`[TRACE] DELETE /api/service-requests/${id}`);

    // Delete photos first (cascade)
    await db.execute(sql`
      DELETE FROM service_request_photos
      WHERE service_request_id = ${id}::uuid AND org_id = ${orgId}::uuid
    `);

    // Delete service request
    const result: any = await db.execute(sql`
      DELETE FROM service_requests
      WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid
      RETURNING id
    `);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Service request not found" });
    }

    res.json({ success: true, message: "Service request deleted" });
  } catch (error: any) {
    console.error("Error deleting service request:", error);
    res.status(500).json({ error: "Failed to delete service request" });
  }
});

/* ----------------- POST: Convert Service Request to Job ------------------ */

router.post("/:id/convert-to-job", async (req, res) => {
  const orgId = req.session?.orgId;
  const userId = req.session?.userId;
  if (!orgId || !userId) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.params;
  const { scheduled_at, assigned_to } = req.body;

  try {
    // Get service request details
    const requestResult: any = await db.execute(sql`
      SELECT * FROM service_requests
      WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!requestResult || requestResult.length === 0) {
      return res.status(404).json({ error: "Service request not found" });
    }

    const request = requestResult[0];

    // Create job
    const jobResult: any = await db.execute(sql`
      INSERT INTO jobs (
        org_id,
        customer_id,
        equipment_id,
        title,
        description,
        scheduled_at,
        assigned_to,
        status,
        created_by
      ) VALUES (
        ${orgId}::uuid,
        ${request.customer_id || null}::uuid,
        ${request.equipment_id || null}::uuid,
        ${request.title},
        ${request.description},
        ${scheduled_at || null}::timestamptz,
        ${assigned_to || userId}::uuid,
        'scheduled',
        ${userId}::uuid
      )
      RETURNING id
    `);

    const jobId = jobResult[0].id;

    // Copy photos to job
    const photos: any = await db.execute(sql`
      SELECT * FROM service_request_photos
      WHERE service_request_id = ${id}::uuid
    `);

    for (const photo of photos) {
      await db.execute(sql`
        INSERT INTO job_photos (job_id, org_id, url)
        VALUES (${jobId}::uuid, ${orgId}::uuid, ${photo.url})
      `);
    }

    // Update service request
    await db.execute(sql`
      UPDATE service_requests
      SET 
        status = 'job_created',
        converted_job_id = ${jobId}::uuid,
        responded_at = NOW()
      WHERE id = ${id}::uuid
    `);

    res.json({ 
      success: true, 
      jobId,
      message: "Service request converted to job" 
    });
  } catch (error: any) {
    console.error("Error converting to job:", error);
    res.status(500).json({ error: "Failed to convert to job" });
  }
});

/* ------------------------ GET: Unread Count ---------------------------- */

router.get("/stats/unread", async (req, res) => {
  const orgId = req.session?.orgId;
  if (!orgId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const result: any = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM service_requests
      WHERE org_id = ${orgId}::uuid AND status = 'pending'
    `);

    res.json({ count: parseInt(result[0]?.count || '0') });
  } catch (error: any) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch count" });
  }
});

export default router;
