/**
 * Service Sheet PDF Generator
 *
 * Pure PDFKit implementation — no Puppeteer required.
 * Produces a styled A4 PDF with:
 *   - Two-column header (company / date+customer)
 *   - Boxed sections for Job Details, Equipment, Work Notes, Hours, Parts
 *   - Photo grid (3-up) with images embedded as Buffers
 */

import { db } from '../db/client';
import { sql } from 'drizzle-orm';

interface ServiceSheetData {
  job: any;
  equipment: any[];
  notes: any[];
  hours: any[];
  parts: any[];
  photos: Array<{ url: string; created_at: string }>;
  orgName: string | null;
}

// ─── Image fetching ───────────────────────────────────────────────────────────

/**
 * Fetch a photo URL and return a raw Buffer (optionally compressed with sharp).
 * Returns null if the image cannot be fetched or decoded.
 */
async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`[PDF] Failed to fetch photo (${response.status}): ${imageUrl}`);
      return null;
    }
    const raw = Buffer.from(await response.arrayBuffer());

    // Optionally compress/resize with sharp (optional dependency)
    try {
      const { default: sharp } = await import('sharp');
      return await sharp(raw)
        .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } catch {
      // sharp not available — return raw buffer as-is
      return raw;
    }
  } catch (err: any) {
    console.warn(`[PDF] Photo fetch error: ${err.message}`);
    return null;
  }
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchServiceSheetData(
  completedJobId: string,
  orgId: string,
): Promise<ServiceSheetData> {
  const completedJobRows: any = await db.execute(sql`
    SELECT * FROM completed_jobs
    WHERE id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
    LIMIT 1
  `);
  if (!completedJobRows?.length) throw new Error('Completed job not found');
  const job = completedJobRows[0];

  let orgName: string | null = null;
  try {
    const orgRows: any = await db.execute(sql`
      SELECT name FROM orgs WHERE id = ${orgId}::uuid LIMIT 1
    `);
    orgName = orgRows?.[0]?.name ?? null;
  } catch { /* non-fatal */ }

  const [equipmentRows, noteRows, hoursRows, partsRows, photoRows] = await Promise.all([
    db.execute(sql`
      SELECT equipment_name FROM completed_job_equipment
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY equipment_name ASC
    `),
    db.execute(sql`
      SELECT text FROM completed_job_notes
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `),
    db.execute(sql`
      SELECT hours, description FROM completed_job_hours
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `),
    db.execute(sql`
      SELECT part_name, quantity FROM completed_job_parts
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `),
    db.execute(sql`
      SELECT id, url, created_at FROM completed_job_photos
      WHERE completed_job_id = ${completedJobId}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at ASC
    `),
  ]);

  const { createSignedViewUrl } = await import('../services/supabase-storage');

  async function resolvePhotoUrl(rawUrl: string | null): Promise<string | null> {
    if (!rawUrl) return null;
    if (rawUrl.startsWith('org/')) return createSignedViewUrl(rawUrl, 900);
    if (rawUrl.startsWith('/api/media/')) {
      const m = rawUrl.match(/^\/api\/media\/([0-9a-f-]{36})\/url/i);
      const mediaId = m?.[1];
      if (!mediaId) return null;
      try {
        const rows: any = await db.execute(sql`
          SELECT key FROM media WHERE id = ${mediaId}::uuid AND org_id = ${orgId}::uuid LIMIT 1
        `);
        const key = rows?.[0]?.key as string | undefined;
        if (!key) return null;
        return createSignedViewUrl(key, 900);
      } catch { return null; }
    }
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return null;
  }

  const resolvedPhotos = await Promise.all(
    (photoRows as any[]).map(async (p) => {
      const url = await resolvePhotoUrl(p.url);
      return url ? { url, created_at: p.created_at } : null;
    }),
  );

  return {
    job,
    equipment: equipmentRows as any[],
    notes:     noteRows     as any[],
    hours:     hoursRows    as any[],
    parts:     partsRows    as any[],
    photos:    resolvedPhotos.filter(Boolean) as Array<{ url: string; created_at: string }>,
    orgName,
  };
}

// ─── PDF generation ───────────────────────────────────────────────────────────

export async function generateServiceSheetPDF(
  completedJobId: string,
  orgId: string,
): Promise<Buffer> {
  const data = await fetchServiceSheetData(completedJobId, orgId);

  const s   = (v: any) => String(v ?? '');
  const fmt = (v: any) => {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? s(v) : d.toLocaleString('en-AU');
  };

  const title       = data.job.title        || 'Service Job';
  const customer    = data.job.customer_name || '—';
  const orgName     = data.orgName           || '';
  const description = s(data.job.description);
  const jobNotes    = s(data.job.notes);

  const equipment = (data.equipment as any[]).map(e => s(e.equipment_name)).filter(Boolean);
  const notes     = (data.notes     as any[]).map(n => s(n.text)).filter(Boolean);
  const hours     = (data.hours     as any[]).map(h => ({ h: Number(h.hours) || 0, desc: s(h.description) }));
  const parts     = (data.parts     as any[]).map(p => ({ name: s(p.part_name), qty: Number(p.quantity) || 0 }));

  // Fetch photo buffers
  console.log(`[PDF] Fetching ${data.photos.length} photos...`);
  const photoResults = await Promise.all(
    data.photos.map(async (p) => {
      const buf = await fetchImageBuffer(p.url);
      return buf ? { buf, created_at: p.created_at } : null;
    }),
  );
  const photos = photoResults.filter(Boolean) as Array<{ buf: Buffer; created_at: string }>;
  console.log(`[PDF] Embedded ${photos.length}/${data.photos.length} photos`);

  // ── Layout constants ──────────────────────────────────────────
  const M  = 50;           // margin
  const PW = 595.28;       // A4 width  (points)
  const PH = 841.89;       // A4 height (points)
  const CW = PW - M * 2;  // content width = 495.28

  // Palette
  const INK    = '#111111';
  const GREY   = '#555555';
  const LTGREY = '#999999';
  const BORDER = '#cccccc';
  const SECBG  = '#f5f5f5';
  const ALTROW = '#fafafa';

  const { default: PDFDocument } = await import('pdfkit');

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => { console.log(`[PDF] Done — ${(Buffer.concat(chunks).length / 1024).toFixed(1)} KB`); resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    let y = M;

    function newPage() { doc.addPage(); y = M; }
    function check(need: number) { if (y + need > PH - M) newPage(); }

    // ── Section header bar ────────────────────────────────────
    function sectionBar(label: string) {
      check(50);
      y += 12;
      doc.rect(M, y, CW, 22).fillColor(SECBG).fill();
      doc.rect(M, y, CW, 22).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(9)
        .text(label, M + 8, y + 7, { lineBreak: false });
      y += 22;
    }

    // ── Box outline around a content region ───────────────────
    // Only draws if the region hasn't crossed a page boundary.
    function boxOutline(fromY: number) {
      if (y > fromY) {
        doc.rect(M, fromY, CW, y - fromY).strokeColor(BORDER).lineWidth(0.5).stroke();
      }
    }

    // ── Key–value row ─────────────────────────────────────────
    function kv(key: string, value: string) {
      if (!value || value === '—' || value === '-') return;
      const valH = doc.heightOfString(value, { width: CW - 118, fontSize: 9 });
      const rowH = Math.max(16, valH + 6);
      check(rowH);
      doc.fillColor(GREY).font('Helvetica-Bold').fontSize(9)
        .text(key + ':', M + 8, y + 2, { width: 100, lineBreak: false });
      doc.fillColor(INK).font('Helvetica').fontSize(9)
        .text(value, M + 110, y + 2, { width: CW - 118 });
      y = doc.y + 3;
    }

    // ── Bullet item ───────────────────────────────────────────
    function bullet(text: string) {
      const h = doc.heightOfString(text, { width: CW - 24, fontSize: 9 });
      check(Math.max(14, h + 4));
      doc.fillColor(INK).font('Helvetica').fontSize(9)
        .text(`•  ${text}`, M + 8, y + 2, { width: CW - 16 });
      y = doc.y + 2;
    }

    // ── Table row (two columns: description left, value right) ─
    function tableRow(left: string, right: string, isHeader: boolean, shade: boolean) {
      const ROW_H = 18;
      check(ROW_H + 2);
      if (isHeader || shade) {
        doc.rect(M, y, CW, ROW_H).fillColor(isHeader ? SECBG : ALTROW).fill();
      }
      doc.rect(M, y, CW, ROW_H).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fillColor(INK).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(left,  M + 8,        y + 5, { width: CW - 88, lineBreak: false });
      doc.fillColor(INK).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(right, M + CW - 76,  y + 5, { width: 68, lineBreak: false, align: 'right' });
      y += ROW_H;
    }

    // ── Muted placeholder text ────────────────────────────────
    function muted(text: string) {
      check(20);
      y += 4;
      doc.fillColor(LTGREY).font('Helvetica').fontSize(9)
        .text(text, M + 8, y, { width: CW - 16 });
      y = doc.y + 6;
    }

    // ════════════════════════════════════════════════════════════
    // HEADER  (two-column)
    // ════════════════════════════════════════════════════════════
    // Left: "Service Sheet" + org name
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(22)
      .text('Service Sheet', M, y, { lineBreak: false });

    // Right: Completed / Customer — anchored to right margin
    const RX = M + CW - 210; // right-column left edge
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(9)
      .text('Completed', RX, y, { width: 65, lineBreak: false });
    doc.fillColor(INK).font('Helvetica').fontSize(9)
      .text(fmt(data.job.completed_at), RX + 67, y, { width: 143, lineBreak: false });

    y += 16;

    if (orgName) {
      doc.fillColor(LTGREY).font('Helvetica').fontSize(9)
        .text(orgName, M, y, { lineBreak: false });
    }
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(9)
      .text('Customer', RX, y, { width: 65, lineBreak: false });
    doc.fillColor(INK).font('Helvetica').fontSize(9)
      .text(customer, RX + 67, y, { width: 143, lineBreak: false });

    y += 18;

    // Separator line
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor('#333333').lineWidth(1.5).stroke();
    y += 8;

    // ════════════════════════════════════════════════════════════
    // JOB DETAILS
    // ════════════════════════════════════════════════════════════
    sectionBar('JOB DETAILS');
    const jobTop = y;
    y += 4;
    kv('Title',       title);
    if (description) kv('Description', description);
    kv('Scheduled',   fmt(data.job.scheduled_at));
    if (jobNotes)    kv('Notes',       jobNotes);
    y += 4;
    boxOutline(jobTop);

    // ════════════════════════════════════════════════════════════
    // EQUIPMENT
    // ════════════════════════════════════════════════════════════
    sectionBar('EQUIPMENT');
    const eqTop = y;
    y += 4;
    if (equipment.length) { equipment.forEach(e => bullet(e)); }
    else { muted('No equipment recorded.'); }
    y += 4;
    boxOutline(eqTop);

    // ════════════════════════════════════════════════════════════
    // WORK NOTES
    // ════════════════════════════════════════════════════════════
    sectionBar('WORK NOTES');
    const notesTop = y;
    y += 4;
    if (notes.length) { notes.forEach(n => bullet(n)); }
    else { muted('No work notes recorded.'); }
    y += 4;
    boxOutline(notesTop);

    // ════════════════════════════════════════════════════════════
    // HOURS
    // ════════════════════════════════════════════════════════════
    sectionBar('HOURS');
    const hoursTop = y;
    if (hours.length) {
      tableRow('Description', 'Hours', true, false);
      hours.forEach((h, i) => tableRow(h.desc || '-', h.h.toFixed(1) + ' h', false, i % 2 === 1));
    } else {
      muted('No hours recorded.');
    }
    boxOutline(hoursTop);

    // ════════════════════════════════════════════════════════════
    // PARTS
    // ════════════════════════════════════════════════════════════
    sectionBar('PARTS');
    const partsTop = y;
    if (parts.length) {
      tableRow('Part', 'Qty', true, false);
      parts.forEach((p, i) => tableRow(p.name || '-', String(p.qty), false, i % 2 === 1));
    } else {
      muted('No parts recorded.');
    }
    boxOutline(partsTop);

    // ════════════════════════════════════════════════════════════
    // PHOTOS  (3-column grid)
    // ════════════════════════════════════════════════════════════
    if (photos.length) {
      sectionBar('PHOTOS');

      const COLS   = 3;
      const GAP    = 8;
      const PHOTO_W = Math.floor((CW - GAP * (COLS - 1)) / COLS);  // ≈ 159
      const PHOTO_H = Math.round(PHOTO_W * 0.72);                   // ≈ 115
      const CAP_H  = 16;
      const CELL_H = PHOTO_H + CAP_H;

      for (let i = 0; i < photos.length; i += COLS) {
        check(CELL_H + GAP + 4);
        const row = photos.slice(i, i + COLS);

        row.forEach((ph, col) => {
          const px = M + col * (PHOTO_W + GAP);
          const py = y;

          // Cell border
          doc.rect(px, py, PHOTO_W, CELL_H).strokeColor(BORDER).lineWidth(0.5).stroke();

          // Image
          try {
            doc.image(ph.buf, px, py, { width: PHOTO_W, height: PHOTO_H });
          } catch (err: any) {
            console.warn('[PDF] Failed to embed photo:', err.message);
            doc.rect(px, py, PHOTO_W, PHOTO_H).fillColor('#eeeeee').fill();
            doc.fillColor(LTGREY).font('Helvetica').fontSize(7)
              .text('Photo unavailable', px, py + PHOTO_H / 2 - 4, {
                width: PHOTO_W, align: 'center', lineBreak: false,
              });
          }

          // Caption divider
          doc.moveTo(px, py + PHOTO_H).lineTo(px + PHOTO_W, py + PHOTO_H)
            .strokeColor(BORDER).lineWidth(0.5).stroke();

          // Date caption
          const dateStr = new Date(ph.created_at).toLocaleDateString('en-AU');
          doc.fillColor(GREY).font('Helvetica').fontSize(7)
            .text(dateStr, px + 4, py + PHOTO_H + 4, { width: PHOTO_W - 8, lineBreak: false });
        });

        y += CELL_H + GAP;
      }
    }

    // ── Footer ────────────────────────────────────────────────
    check(20);
    y += 10;
    doc.fillColor(LTGREY).font('Helvetica').fontSize(7)
      .text(`Completed Job ID: ${completedJobId}`, M, y, { width: CW });

    doc.end();
  });
}
