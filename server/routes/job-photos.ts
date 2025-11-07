import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  createSignedUploadUrl,
  createSignedViewUrl,
  uploadPhotoToSupabase,
  deleteFile,
  listJobPhotos,
} from '../services/supabase';

const router = Router();

// Session guard — matches your existing pattern
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId || !req.session?.orgId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Memory upload (for direct server-side uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB to match bucket
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|heic|heif|avif|bmp|tiff)$/i.test(file.mimetype);
    if (!ok) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

/**
 * 1) Create a **signed upload URL** the client can PUT to directly (no file through your server)
 *    Client will: `fetch(uploadUrl, { method: 'PUT', body: file })`
 */
router.post('/:jobId/photos/signed-upload', requireAuth, async (req: any, res) => {
  try {
    const tenantId = String(req.session.orgId);
    const jobId = String(req.params.jobId);
    const { ext = 'jpg' } = req.body || {};

    const { key, uploadUrl, token } = await createSignedUploadUrl({
      tenantId,
      jobId,
      ext,
    });

    return res.json({ ok: true, key, uploadUrl, token });
  } catch (e: any) {
    console.error('[JOB PHOTOS] signed-upload error:', e);
    return res.status(500).json({ error: e.message || 'failed to create signed upload URL' });
  }
});

/**
 * 2) **Server-side** upload (mobile/web form posts file to your API)
 *    form-data field name: `photo`
 */
router.post('/:jobId/photos/upload', requireAuth, upload.single('photo'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const tenantId = String(req.session.orgId);
    const jobId = String(req.params.jobId);
    const ext = (path.extname(req.file.originalname) || '.jpg').slice(1);

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
    console.error('[JOB PHOTOS] upload error:', e);
    return res.status(500).json({ error: e.message || 'upload failed' });
  }
});

/**
 * 3) Get a **fresh signed view URL** for any stored key
 */
router.post('/photos/sign', requireAuth, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });

    // Basic tenant safety
    const tenantId = String(req.session.orgId);
    if (!key.startsWith(`org/${tenantId}/`)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const url = await createSignedViewUrl(key, 60 * 60 * 24 * 7);
    return res.json({ ok: true, url });
  } catch (e: any) {
    console.error('[JOB PHOTOS] sign error:', e);
    return res.status(500).json({ error: e.message || 'sign failed' });
  }
});

/**
 * 4) Delete a photo by its storage key
 */
router.delete('/photos', requireAuth, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });

    const tenantId = String(req.session.orgId);
    if (!key.startsWith(`org/${tenantId}/`)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    await deleteFile(key);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[JOB PHOTOS] delete error:', e);
    return res.status(500).json({ error: e.message || 'delete failed' });
  }
});

/**
 * 5) (Optional) Basic listing – returns top-level entries under the tenant.
 *    If you want a strict per-job recursive list, we can add a deeper walker later.
 */
router.get('/:jobId/photos', requireAuth, async (req: any, res) => {
  try {
    const tenantId = String(req.session.orgId);
    const jobId = String(req.params.jobId);

    const entries = await listJobPhotos(tenantId, jobId);

    // Filter for jobId in key path
    const filtered = (entries || []).filter((e: any) =>
      typeof e.name === 'string' ? e.name.includes(jobId) : false
    );

    return res.json({ ok: true, items: filtered });
  } catch (e: any) {
    console.error('[JOB PHOTOS] list error:', e);
    return res.status(500).json({ error: e.message || 'list failed' });
  }
});

export default router;
