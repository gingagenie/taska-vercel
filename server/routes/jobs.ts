import { Router } from "express";
import { db } from "../db/client";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { sql } from "drizzle-orm";

export const jobs = Router();

// UUID validation helper
function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

// Extract media UUID from /api/media/:id/url
function extractMediaIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/api\/media\/([0-9a-f-]{36})\/url/i);
  return m ? m[1] : null;
}

// Timezone-aware scheduled_at normalization
function normalizeScheduledAt(raw: any): string | null {
  if (!raw) return null;
  // If client already sent proper UTC ISO with Z, pass it through
  if (typeof raw === "string" && /Z$/.test(raw)) return raw;

  // If it looks like "YYYY-MM-DDTHH:mm" (datetime-local), it should now be coming pre-converted from client
  // Client should use isoFromLocalInput() to convert Melbourne time to UTC before sending
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    // Treat as Melbourne time and convert to UTC (subtract 10 hours)
    const localDate = new Date(raw + ":00"); // Add seconds if missing
    const utcDate = new Date(localDate.getTime() - 10 * 60 * 60 * 1000); // Melbourne is UTC+10
    if (!isNaN(utcDate.valueOf())) return utcDate.toISOString();
  }

  // Fallback: let Postgres parse; but ensure timestamptz column
  return raw;
}

// Configure multer for file uploads with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    // Accept only image files including HEIF/HEIC variants from iOS devices
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

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed jobs" });
  }
});

/**
 * ✅ SERVICE SHEET
 * GET /api/jobs/completed/:completedJobId/service-sheet
 *
 * Returns { ok, key, url, filename }
 * - Optional: ?download=1 streams PDF directly
 */
jobs.get(
  "/completed/:completedJobId/service-sheet",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const { completedJobId } = req.params;
    const orgId = (req as any).orgId;

    if (!isUuid(completedJobId)) return res.status(400).json({ error: "Invalid completedJobId" });

    try {
      const completedJobRows: any = await db.execute(sql`
        SELECT *
        FROM completed_jobs
        WHERE id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
        LIMIT 1
      `);

      if (!completedJobRows?.length) {
        return res.status(404).json({ error: "Completed job not found" });
      }

      const job = completedJobRows[0];

      const [equipmentRows, noteRows, hoursRows, partsRows] = await Promise.all([
        db.execute(sql`
          SELECT equipment_name, equipment_id, created_at
          FROM completed_job_equipment
          WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
          ORDER BY equipment_name ASC
        `),
        db.execute(sql`
          SELECT text, created_at
          FROM completed_job_notes
          WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
          ORDER BY created_at ASC
        `),
        db.execute(sql`
          SELECT hours, description, created_at
          FROM completed_job_hours
          WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
          ORDER BY created_at ASC
        `),
        db.execute(sql`
          SELECT part_name, quantity, created_at
          FROM completed_job_parts
          WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
          ORDER BY created_at ASC
        `),
      ]);

      const esc = (v: any) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const fmtDate = (v: any) => {
        if (!v) return "-";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString("en-AU");
      };

      const equipmentList = (equipmentRows as any[]).map((e) => esc(e.equipment_name)).filter(Boolean);
      const notesList = (noteRows as any[]).map((n) => esc(n.text)).filter(Boolean);
      const hoursList = (hoursRows as any[]).map((h) => ({
        hours: Number(h.hours) || 0,
        description: esc(h.description || ""),
      }));
      const partsList = (partsRows as any[]).map((p) => ({
        part_name: esc(p.part_name || ""),
        quantity: Number(p.quantity) || 0,
      }));

      const title = job.title || "Service Job";
      const customer = job.customer_name || "—";

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    h2 { font-size: 13px; margin: 18px 0 8px; }
    .muted { color: #555; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 10px 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; text-align: left; }
    th { background: #fafafa; font-weight: 700; }
    .right { text-align: right; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    .small { font-size: 11px; }
  </style>
</head>
<body>
  <div class="row">
    <div>
      <h1>Service Sheet</h1>
      <div class="muted small">Taska • Completed Job</div>
    </div>
    <div style="text-align:right;">
      <div><strong>Completed:</strong> ${esc(fmtDate(job.completed_at))}</div>
      <div><strong>Customer:</strong> ${esc(customer)}</div>
    </div>
  </div>

  <h2>Job</h2>
  <div class="box">
    <div><strong>Title:</strong> ${esc(title)}</div>
    <div><strong>Description:</strong> ${esc(job.description || "—")}</div>
    <div><strong>Scheduled:</strong> ${esc(fmtDate(job.scheduled_at))}</div>
    ${job.notes ? `<div style="margin-top:8px;"><strong>Notes:</strong><br/>${esc(job.notes)}</div>` : ""}
  </div>

  <h2>Equipment</h2>
  <div class="box">
    ${
      equipmentList.length
        ? `<ul>${equipmentList.map((x) => `<li>${x}</li>`).join("")}</ul>`
        : `<div class="muted">No equipment recorded.</div>`
    }
  </div>

  <h2>Work Notes</h2>
  <div class="box">
    ${
      notesList.length
        ? `<ul>${notesList.map((x) => `<li>${x}</li>`).join("")}</ul>`
        : `<div class="muted">No work notes recorded.</div>`
    }
  </div>

  <h2>Hours</h2>
  <div class="box">
    ${
      hoursList.length
        ? `<table><thead><tr><th>Description</th><th class="right">Hours</th></tr></thead><tbody>
          ${hoursList
            .map((h) => `<tr><td>${h.description || "-"}</td><td class="right">${h.hours.toFixed(1)}</td></tr>`)
            .join("")}
        </tbody></table>`
        : `<div class="muted">No hours recorded.</div>`
    }
  </div>

  <h2>Parts</h2>
  <div class="box">
    ${
      partsList.length
        ? `<table><thead><tr><th>Part</th><th class="right">Qty</th></tr></thead><tbody>
          ${partsList
            .map((p) => `<tr><td>${p.part_name || "-"}</td><td class="right">${p.quantity}</td></tr>`)
            .join("")}
        </tbody></table>`
        : `<div class="muted">No parts recorded.</div>`
    }
  </div>

  <div class="muted small" style="margin-top:18px;">
    Completed Job ID: ${esc(completedJobId)}
  </div>
</body>
</html>`;

      // Generate PDF (Puppeteer first, PDFKit fallback)
      let pdfBuffer: Buffer;

      try {
        const puppeteer = (await import("puppeteer")).default;
        let browser: any = null;
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
          });

          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
          await new Promise((r) => setTimeout(r, 250));

          const buf = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
          });

          pdfBuffer = Buffer.from(buf);
        } finally {
          if (browser) await browser.close();
        }
      } catch (puppErr: any) {
        console.warn("[SERVICE_SHEET] Puppeteer failed, using PDFKit fallback:", puppErr?.message);

        const PDFDocument = (await import("pdfkit")).default;
        pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
          const doc = new PDFDocument({ size: "A4", margin: 50 });
          const chunks: Buffer[] = [];
          doc.on("data", (c: any) => chunks.push(c));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", reject);

          doc.fontSize(18).text("Service Sheet");
          doc.moveDown();
          doc.fontSize(11).text(`Customer: ${customer}`);
          doc.text(`Job: ${title}`);
          doc.text(`Completed: ${fmtDate(job.completed_at)}`);
          doc.moveDown();

          doc.fontSize(12).text("Description", { underline: true });
          doc.fontSize(10).text(job.description || "—");
          doc.moveDown();

          if (job.notes) {
            doc.fontSize(12).text("Notes", { underline: true });
            doc.fontSize(10).text(job.notes);
            doc.moveDown();
          }

          doc.fontSize(12).text("Equipment", { underline: true });
          doc.fontSize(10).text(equipmentList.length ? equipmentList.join("\n") : "—");
          doc.moveDown();

          doc.fontSize(12).text("Work Notes", { underline: true });
          doc.fontSize(10).text(notesList.length ? notesList.join("\n") : "—");
          doc.moveDown();

          doc.fontSize(12).text("Hours", { underline: true });
          if (hoursList.length) {
            hoursList.forEach((h) => doc.fontSize(10).text(`- ${h.description || "Hours"}: ${h.hours}`));
          } else {
            doc.fontSize(10).text("—");
          }
          doc.moveDown();

          doc.fontSize(12).text("Parts", { underline: true });
          if (partsList.length) {
            partsList.forEach((p) => doc.fontSize(10).text(`- ${p.part_name || "Part"} x ${p.quantity}`));
          } else {
            doc.fontSize(10).text("—");
          }

          doc.end();
        });
      }

      const filename = `service-sheet-${completedJobId}.pdf`;

      if (String(req.query.download || "") === "1") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
      }

      const { uploadFile, createSignedViewUrl } = await import("../services/supabase-storage");

      const key = `org/${orgId}/completed/${completedJobId}/docs/${filename}`;

      const ok = await uploadFile(key, pdfBuffer, "application/pdf");
      if (!ok) return res.status(500).json({ error: "Failed to upload service sheet to storage" });

      const signedUrl = await createSignedViewUrl(key, 900);

      res.json({ ok: true, key, url: signedUrl, filename });
    } catch (e: any) {
      console.error("GET /api/jobs/completed/:completedJobId/service-sheet error:", e);
      res.status(500).json({ error: e?.message || "Failed to generate service sheet" });
    }
  }
);

/* GET INDIVIDUAL COMPLETED JOB */
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

// GET /completed/:jobId/notes - Get notes for completed job
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

// GET /completed/:jobId/photos - Get photos for completed job
// ✅ We don't need object_key. Your stored url (/api/media/:id/url) will handle signing.
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

    res.json(r);
  } catch (e: any) {
    console.error("GET /api/jobs/completed/%s/photos error:", jobId, e);
    res.status(500).json({ error: e?.message || "Failed to fetch completed job photos" });
  }
});

// GET /completed/:jobId/equipment - Get equipment for completed job
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

/* LIST (now includes description) */
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

// --- TECH FILTER SOURCE ---
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

// --- RANGE with optional techId filter ---
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

// GET /customers - Return dropdown data by org
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

// GET /:jobId - Return specific job with details
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

// POST /create - Insert new job
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

// --- DRAG-TO-RESCHEDULE ---
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

// PUT /:jobId - Update job
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

/* JOB PHOTOS (ACTIVE JOBS) */

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
        } else {
          return res.status(400).json({ error: err.message || "Invalid file type" });
        }
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

      // Supabase path (preferred)
      try {
        const { uploadPhotoToSupabase } = await import("../services/supabase-storage");
        const { media } = await import("../../shared/schema");

        const uploadResult = await uploadPhotoToSupabase({
          tenantId: orgId,
          jobId,
          ext,
          fileBuffer: file.buffer,
          contentType: file.mimetype,
        });

        const [mediaRecord] = await db
          .insert(media)
          .values({
            orgId,
            jobId,
            key: uploadResult.key,
            kind: "photo",
            ext,
            bytes: file.size,
            isPublic: false,
            createdBy: userId,
          })
          .returning();

        const url = `/api/media/${mediaRecord.id}/url`;

        const result = await db.execute(sql`
          INSERT INTO job_photos (job_id, org_id, url, object_key, media_id)
          VALUES (${jobId}::uuid, ${orgId}::uuid, ${url}, ${uploadResult.key}, ${mediaRecord.id})
          RETURNING id, url, object_key, created_at
        `);

        return res.json(result[0]);
      } catch (supabaseError: any) {
        console.warn(`[PHOTO_UPLOAD] Supabase upload failed, falling back:`, supabaseError.message);

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

// DELETE /:jobId/photos/:photoId - Delete a photo
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
      set notes = ${notes || ""}, updated_at = now()
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
        ${job.title}, ${job.description}, ${job.job_type}, ${job.notes}, ${job.scheduled_at},
        ${userId}, ${job.created_by}, ${job.created_at}
      )
      RETURNING id, completed_at
    `);

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

    // ✅ Copy photos WITHOUT object_key/media_id (your completed_job_photos doesn't have those cols)
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
    if (job.job_type === "Service") {
      const equipmentWithIntervals: any = await db.execute(sql`
        SELECT e.id, e.name, e.service_interval_months, e.customer_id
        FROM job_equipment je
        JOIN equipment e ON e.id = je.equipment_id
        WHERE je.job_id = ${jobId}::uuid 
          AND e.service_interval_months IS NOT NULL
      `);

      for (const eq of equipmentWithIntervals) {
        try {
          const nextServiceDate = await db.execute(sql`
            SELECT (CURRENT_DATE + INTERVAL '${sql.raw(eq.service_interval_months.toString())} months')::timestamp as next_date
          `);
          const scheduledDate = (nextServiceDate as any)[0].next_date;

          const followUpResult = await db.execute(sql`
            INSERT INTO jobs (
              org_id, customer_id, title, description, job_type, 
              scheduled_at, status, created_by
            )
            VALUES (
              ${orgId}::uuid,
              ${eq.customer_id}::uuid,
              ${`Service - ${eq.name}`},
              ${`Follow-up service from ${job.title || "completed job"}`},
              'Service',
              ${scheduledDate},
              'new',
              ${userId}
            )
            RETURNING id
          `);

          const followUpJobId = (followUpResult as any)[0].id;

          await db.execute(sql`
            INSERT INTO job_equipment (job_id, equipment_id)
            VALUES (${followUpJobId}::uuid, ${eq.id}::uuid)
          `);

          await db.execute(sql`
            UPDATE equipment 
            SET 
              last_service_date = CURRENT_DATE,
              next_service_date = ${scheduledDate}
            WHERE id = ${eq.id}::uuid
          `);
        } catch (err: any) {
          console.error(`[JOB COMPLETION] Failed to create follow-up for equipment ${eq.id}:`, err);
        }
      }
    }

    // Cleanup active job rows
    await db.execute(sql`DELETE FROM job_notifications WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_assignments WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_equipment WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_photos WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_hours WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_notes WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM job_parts WHERE job_id = ${jobId}::uuid`);
    await db.execute(sql`DELETE FROM jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);

    res.json({
      ok: true,
      completed_job_id: completedResult[0].id,
      completed_at: completedResult[0].completed_at,
    });
  } catch (e: any) {
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

/* ADD PARTS TO JOB */
jobs.post("/:jobId/parts", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const { partName, quantity } = req.body;
  const orgId = (req as any).orgId;

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });
  if (!partName || typeof partName !== "string") {
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

/* CONVERT COMPLETED JOB TO INVOICE (unchanged logic) */
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

    let equipmentInfo = null;

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
      const equipmentResult: any = await db.execute(sql`
        SELECT e.name, e.make, e.model, e.serial
        FROM job_equipment je
        JOIN equipment e ON e.id = je.equipment_id
        WHERE je.job_id = ${completedJob.original_job_id}::uuid AND e.org_id = ${orgId}::uuid
        LIMIT 1
      `);
      if (equipmentResult.length > 0) equipmentInfo = equipmentResult[0];
    }

    if (!completedJob.customer_id) return res.status(400).json({ error: "Cannot create invoice: job has no customer" });

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
      const lowerName = preset.name.toLowerCase();
      presetMap.set(lowerName, preset);

      if (!laborPreset && lowerName === "labour") laborPreset = preset;
      else if (!laborPreset && lowerName === "labor") laborPreset = preset;
      else if (!laborPreset && (lowerName.includes("labour") || lowerName.includes("labor") || lowerName.includes("hour"))) laborPreset = preset;
    }

    const noteEntries: any = await db.execute(sql`
      SELECT text, created_at
      FROM completed_job_notes
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `);

    let combinedNotes = completedJob.notes || "";
    if (noteEntries.length > 0) {
      const noteTexts = noteEntries.map((note: any) => note.text).join("\n");
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
      const match = lastInvoiceResult[0].number.match(/inv-(\d+)/i);
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
      const partName = part.part_name?.trim();
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

/* DELETE ACTIVE JOB */
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

  if (!isUuid(jobId)) return res.status(400).json({ error: "Invalid jobId" });

  try {
    // Pull photo URLs
    const photosResult: any = await db.execute(sql`
      SELECT url
      FROM completed_job_photos 
      WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid
    `);

    // ✅ Try to delete Supabase objects via media table (URL contains media id)
    try {
      const { deleteFile } = await import("../services/supabase-storage");

      const mediaIds = (photosResult || [])
        .map((p: any) => extractMediaIdFromUrl(p.url))
        .filter((x: any) => x && isUuid(x));

      if (mediaIds.length) {
        // Fetch keys
        const mediaRows: any = await db.execute(sql`
          SELECT id, key
          FROM media
          WHERE org_id = ${orgId}::uuid
            AND id = ANY(${mediaIds}::uuid[])
        `);

        for (const m of mediaRows || []) {
          if (m.key) {
            await deleteFile(String(m.key));
          }
        }

        // Optional: delete media rows (safe because they belong to org)
        await db.execute(sql`
          DELETE FROM media
          WHERE org_id = ${orgId}::uuid
            AND id = ANY(${mediaIds}::uuid[])
        `);
      }
    } catch (supDelErr: any) {
      console.error("Error deleting Supabase media during completed job deletion:", supDelErr?.message || supDelErr);
    }

    // Delete completed job children
    await db.execute(sql`DELETE FROM completed_job_charges WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_hours WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_parts WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_notes WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
    await db.execute(sql`DELETE FROM completed_job_photos WHERE completed_job_id = ${jobId}::uuid AND org_id = ${orgId}::uuid`);
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

export default jobs;
