/**
 * ✅ SERVICE SHEET (with photos + org branding)
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

    if (!isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid completedJobId" });
    }

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

      // Org name for branding (optional)
      let orgName: string | null = null;
      try {
        const orgRows: any = await db.execute(sql`
          SELECT name
          FROM orgs
          WHERE id = ${orgId}::uuid
          LIMIT 1
        `);
        orgName = orgRows?.[0]?.name || null;
      } catch {
        orgName = null;
      }

      // Pull all the bits that matter
      const [equipmentRows, noteRows, hoursRows, partsRows, photoRows] = await Promise.all([
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
        db.execute(sql`
          SELECT id, url, created_at
          FROM completed_job_photos
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

      // ---- PHOTO RESOLUTION (make URLs usable in a headless PDF renderer) ----
      // Handles:
      // - Supabase keys stored as "org/..." -> signed URL
      // - URLs stored as "/api/media/:id/url" -> lookup media.key then signed URL
      // - Absolute https URLs -> pass through
      // - Anything else -> skip (or pass-through as last resort)
      const { createSignedViewUrl } = await import("../services/supabase-storage");

      async function resolvePhotoUrl(rawUrl: string | null): Promise<string | null> {
        if (!rawUrl) return null;

        // Supabase object key stored directly
        if (rawUrl.startsWith("org/")) {
          return await createSignedViewUrl(rawUrl, 900);
        }

        // If stored as your media proxy route, resolve via media table -> key -> signed url
        // e.g. /api/media/<uuid>/url
        if (rawUrl.startsWith("/api/media/")) {
          const m = rawUrl.match(/^\/api\/media\/([0-9a-f-]{36})\/url/i);
          const mediaId = m?.[1];
          if (!mediaId) return null;

          try {
            const mediaRows: any = await db.execute(sql`
              SELECT key
              FROM media
              WHERE id = ${mediaId}::uuid AND org_id = ${orgId}::uuid
              LIMIT 1
            `);
            const key = mediaRows?.[0]?.key as string | undefined;
            if (!key) return null;

            return await createSignedViewUrl(key, 900);
          } catch {
            return null;
          }
        }

        // Already absolute
        if (/^https?:\/\//i.test(rawUrl)) {
          return rawUrl;
        }

        // As a last resort, try turning relative into absolute (may still fail if auth-protected)
        const proto =
          (req.headers["x-forwarded-proto"] as string) ||
          ((req as any).protocol as string) ||
          "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        if (host && rawUrl.startsWith("/")) {
          return `${proto}://${host}${rawUrl}`;
        }

        return null;
      }

      const resolvedPhotos = await Promise.all(
        (photoRows as any[]).map(async (p) => {
          const url = await resolvePhotoUrl(p.url);
          return url
            ? { url, created_at: p.created_at }
            : null;
        })
      );

      const photoList = resolvedPhotos.filter(Boolean) as Array<{ url: string; created_at: string }>;

      // ---- HTML ----
      const brandLine = orgName ? esc(orgName) : ""; // if you want blank, it’ll be blank

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

    /* Photos */
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .photo { border: 1px solid #eee; border-radius: 10px; overflow: hidden; background: #fff; }
    .photo img { width: 100%; height: 140px; object-fit: cover; display: block; }
    .photo .cap { font-size: 10px; color: #555; padding: 6px 8px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="row">
    <div>
      <h1>Service Sheet</h1>
      ${brandLine ? `<div class="muted small">${brandLine}</div>` : ``}
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

  <h2>Photos</h2>
  <div class="box">
    ${
      photoList.length
        ? `<div class="photos">
            ${photoList
              .map(
                (p) => `
                <div class="photo">
                  <img src="${esc(p.url)}" />
                  <div class="cap">${esc(new Date(p.created_at).toLocaleDateString("en-AU"))}</div>
                </div>
              `
              )
              .join("")}
          </div>`
        : `<div class="muted">No photos recorded.</div>`
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
          await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
          await new Promise((r) => setTimeout(r, 200));

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
          if (orgName) doc.fontSize(10).fillColor("#555").text(orgName);
          doc.fillColor("#000");
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

          // NOTE: PDFKit fallback does NOT embed photos (it can, but it’s extra plumbing)
          // Puppeteer path above will include photos.

          doc.end();
        });
      }

      const filename = `service-sheet-${completedJobId}.pdf`;

      // Optional direct download
      if (String(req.query.download || "") === "1") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
      }

      // Upload via Supabase Storage using uploadFileToSupabase() that exists in your service
      const storage = await import("../services/supabase-storage");
      const uploadFileToSupabase = (storage as any).uploadFileToSupabase;
      const createSignedViewUrl2 = (storage as any).createSignedViewUrl;

      if (typeof uploadFileToSupabase !== "function") {
        return res.status(500).json({
          error: "uploadFileToSupabase() is not available in supabase-storage service",
        });
      }

      // Use your existing helper (tenantId/orgId + folder)
      // This avoids inventing a different signature
      const uploaded = await uploadFileToSupabase({
        tenantId: orgId,
        jobId: completedJobId,
        ext: "pdf",
        fileBuffer: pdfBuffer,
        contentType: "application/pdf",
        folder: "service-sheets",
      });

      const signedUrl =
        typeof createSignedViewUrl2 === "function"
          ? await createSignedViewUrl2(uploaded.key, 900)
          : null;

      res.json({ ok: true, key: uploaded.key, url: signedUrl, filename });
    } catch (e: any) {
      console.error("GET /api/jobs/completed/:completedJobId/service-sheet error:", e);
      res.status(500).json({ error: e?.message || "Failed to generate service sheet" });
    }
  }
);
