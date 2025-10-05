import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { db } from "../db";
import { media } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { 
  createSignedUploadUrl, 
  createSignedViewUrl,
  ensurePhotoBucketExists,
  PhotoUploadParams 
} from "../services/supabase-storage";

const router = Router();

// Ensure bucket exists on server start
ensurePhotoBucketExists().catch(console.error);

/**
 * POST /api/media/sign-upload
 * Request a signed upload URL for direct client-to-Supabase upload
 */
router.post("/sign-upload", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId, ext = "jpg" } = req.body;
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    
    if (!orgId) {
      return res.status(400).json({ error: "Organization ID required" });
    }
    
    const params: PhotoUploadParams = {
      tenantId: orgId,
      jobId,
      ext: ext.replace(".", ""), // Remove leading dot if present
    };
    
    const uploadData = await createSignedUploadUrl(params);
    
    console.log(`[MEDIA_UPLOAD] Signed upload URL created for org=${orgId}, job=${jobId || "misc"}, key=${uploadData.key}`);
    
    res.json({
      key: uploadData.key,
      uploadUrl: uploadData.uploadUrl,
      token: uploadData.token,
    });
  } catch (error: any) {
    console.error("[MEDIA_UPLOAD] Failed to create signed upload URL:", error);
    res.status(500).json({ error: error.message || "Failed to create upload URL" });
  }
});

/**
 * POST /api/media/commit
 * Record metadata after successful upload
 */
router.post("/commit", requireAuth, requireOrg, async (req, res) => {
  try {
    const { key, jobId, bytes, ext, sha256, width, height } = req.body;
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    
    if (!key) {
      return res.status(400).json({ error: "Key required" });
    }
    
    // Insert media record
    const [mediaRecord] = await db.insert(media).values({
      orgId,
      jobId: jobId || null,
      key,
      kind: "photo",
      ext,
      bytes: bytes || null,
      width: width || null,
      height: height || null,
      sha256: sha256 || null,
      isPublic: false,
      createdBy: userId,
    }).returning();
    
    console.log(`[MEDIA_COMMIT] Media record created: id=${mediaRecord.id}, key=${key}`);
    
    res.json({ ok: true, mediaId: mediaRecord.id });
  } catch (error: any) {
    console.error("[MEDIA_COMMIT] Failed to commit media:", error);
    res.status(500).json({ error: error.message || "Failed to commit media" });
  }
});

/**
 * GET /api/media/:id/url
 * Redirect to signed viewing URL for a media item (for use in <img> tags)
 */
router.get("/:id/url", requireAuth, requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = (req as any).orgId;
    const expiresIn = parseInt(req.query.expires as string || "900", 10); // Default 15 min
    
    // Lookup media record
    const [mediaRecord] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, id), eq(media.orgId, orgId)));
    
    if (!mediaRecord) {
      return res.status(404).json({ error: "Media not found" });
    }
    
    // Create signed URL
    const signedUrl = await createSignedViewUrl(mediaRecord.key, expiresIn);
    
    if (!signedUrl) {
      return res.status(500).json({ error: "Failed to create signed URL" });
    }
    
    console.log(`[MEDIA_VIEW] Redirecting to signed URL for media=${id}, key=${mediaRecord.key}`);
    
    // Redirect to the signed Supabase Storage URL
    res.redirect(signedUrl);
  } catch (error: any) {
    console.error("[MEDIA_VIEW] Failed to get media URL:", error);
    res.status(500).json({ error: error.message || "Failed to get media URL" });
  }
});

/**
 * GET /api/media/job/:jobId
 * List all media for a job
 */
router.get("/job/:jobId", requireAuth, requireOrg, async (req, res) => {
  try {
    const { jobId } = req.params;
    const orgId = (req as any).orgId;
    
    const mediaRecords = await db
      .select()
      .from(media)
      .where(and(eq(media.jobId, jobId), eq(media.orgId, orgId)))
      .orderBy(sql`${media.createdAt} DESC`);
    
    res.json(mediaRecords);
  } catch (error: any) {
    console.error("[MEDIA_LIST] Failed to list job media:", error);
    res.status(500).json({ error: error.message || "Failed to list media" });
  }
});

export default router;
