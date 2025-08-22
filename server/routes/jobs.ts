import { Router } from "express";
import { db } from "../db";
import { jobs as jobsSchema, customers, equipment } from "../../shared/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { sql, eq, and } from "drizzle-orm";

export const jobs = Router();

// Add ping endpoint for health check
jobs.get("/ping", (_req, res) => {
  console.log("[TRACE] GET /api/jobs/ping");
  res.json({ ok: true });
});

// GET / - List jobs by org
jobs.get("/", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    console.log("[TRACE] GET /api/jobs org=%s", orgId);
    
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
      .where(eq(jobsSchema.orgId, orgId));

    res.json(result);
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
  try {
    const orgId = (req as any).orgId;
    let { title, description, status, scheduledAt, customerId } = req.body || {};
    
    console.log("[TRACE] POST /api/jobs/create org=%s body=%o", orgId, req.body);

    // Coerce empty strings to null
    if (customerId === "") customerId = null;
    if (scheduledAt === "") scheduledAt = null;
    
    const result = await db
      .insert(jobsSchema)
      .values({
        title: title || "Untitled Job",
        description: description || "",
        status: status || "new",
        scheduledAt: scheduledAt,
        customerId: customerId,
        orgId: orgId,
      })
      .returning({ id: jobsSchema.id });

    console.log("[TRACE] POST /api/jobs/create -> created job %s", result[0].id);
    res.json({ ok: true, id: result[0].id });
  } catch (error: any) {
    console.error("POST /api/jobs/create error:", error);
    res.status(500).json({ error: error?.message || "Failed to create job" });
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

  // Normalize date strings like "2025-08-22T10:00"
  const normalizeDate = (v: any): string | null => {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v);
    if (s.includes("T")) {
      const [d, t] = s.split("T");
      const tt = t.length === 5 ? `${t}:00` : t;
      return `${d} ${tt}`.slice(0, 19);
    }
    return s;
  };
  scheduledAt = normalizeDate(scheduledAt);

  // Always log what we received (so we know the route is hit)
  console.log("PUT /api/jobs/%s org=%s body=%o", jobId, orgId, {
    title, description, status, scheduledAt, customerId
  });

  try {
    // Prepare update data - only include defined fields
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt;
    if (customerId !== undefined) updateData.customerId = customerId;

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

// Default export
export default jobs;