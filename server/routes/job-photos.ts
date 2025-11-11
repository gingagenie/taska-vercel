import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  createSignedUploadUrl,
  createSignedViewUrl,
  uploadPhotoToSupabase,
  deleteFile,
  // listJobPhotos, // no longer needed
} from "../services/supabase";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const router = Router();

// Session guard — matches your existing pattern
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId || !req.session?.orgId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// Memory upload (for direct server-side uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|heic|heif|avif|bmp|tiff)$/i.test(
      file.mimetype
    );
    if (!ok) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  },
});

/**
 * 1) Signed upload URL for direct client PUT
 */
router.post("/:jobId/photos/signed-upload", requireAuth, async (req: any, res) => {
  try {
    const tenantId = String(req.session.orgId);
    const jobId = String(req.params.jobId);
    const { ext = "jpg" } = req.body || {};

    const { key, uploadUrl, token } = await createSignedUploadUrl({
      tenantId,
      jobId,
      ext,
    });

    return res.json({ ok: true, key, uploadUrl, token });
  } catch (e: any) {
    console.error("[JOB PHOTOS] signed-upload error:", e);
    return res
      .status(500)
      .json({ error: e.message || "failed to create signed upload URL" });
  }
});

/**
 * 2) Server-side upload: form-data field `photo`
 */
router.post(
  "/:jobId/photos/upload",
  requireAuth,
  upload.single("photo"),
  async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file" });

      const tenantId = String(req.session.orgId);
      const jobId = String(req.params.jobId);
      const ext = (path.extname(req.file.originalname) || ".jpg").slice(1);

      const { key } = await uploadPhotoToSupabase({
        tenantId,
        jobId,
        ext,
        fileBuffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      const signedUrl = await createSignedViewUrl(key, 60 * 60 * 24 * 7); // 7 days

      return res.json({ ok: true, key, url: signedUrl });
    } catch (e: any) {
      console.error("[JOB PHOTOS] upload error:", e);
      return res
        .status(500)
        .json({ error: e.message || "upload failed" });
    }
  }
);

/**
 * 3) Fresh signed view URL for any key
 */
router.post("/photos/sign", requireAuth, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });

    const tenantId = String(req.session.orgId);
    if (!key.startsWith(`org/${tenantId}/`)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const url = await createSignedViewUrl(key, 60 * 60 * 24 * 7);
    return res.json({ ok: true, url });
  } catch (e: any) {
    console.error("[JOB PHOTOS] sign error:", e);
    return res
      .status(500)
      .json({ error: e.message || "sign failed" });
  }
});

/**
 * 4) Delete a photo by its storage key
 */
router.delete("/photos", requireAuth, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });

    const tenantId = String(req.session.orgId);
    if (!key.startsWith(`org/${tenantId}/`)) {
      return res.status(403).json({ error: "forbidden" });
    }

    await deleteFile(key);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[JOB PHOTOS] delete error:", e);
    return res
      .status(500)
      .json({ error: e.message || "delete failed" });
  }
});

/**
 * 5) List photos for a job – **returns plain array**
 */
router.get("/:jobId/photos", requireAuth, async (req: any, res) => {
  try {
    const tenantId = String(req.session.orgId);
    const jobId = String(req.params.jobId);

    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const rows: any = await db.execute(sql`
      SELECT id, url, object_key, created_at
      FROM job_photos
      WHERE job_id = ${jobId}::uuid
        AND org_id = ${tenantId}::uuid
      ORDER BY created_at DESC
    `);

    // plain array so all existing callers can do photos.map(...)
    return res.json(rows);
  } catch (e: any) {
    console.error("[JOB PHOTOS] list error:", e);
    return res
      .status(500)
      .json({ error: e.message || "list failed" });
  }
});

export default router;
