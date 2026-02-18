import { StorageClient } from "@supabase/storage-js";
import crypto from "node:crypto";

const BUCKET_NAME = "photos"; // yes, still using the same bucket for now

// Lazy-load storage client (only create when needed)
let _storageClient: StorageClient | null = null;

function getStorageClient(): StorageClient {
  if (_storageClient) return _storageClient;
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL environment variable is not set');
  }
  if (!SUPABASE_SERVICE_ROLE) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  }
  
  const storageUrl = `${SUPABASE_URL}/storage/v1`;
  _storageClient = new StorageClient(storageUrl, {
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  });
  
  return _storageClient;
}

export interface PhotoUploadParams {
  tenantId: string;
  jobId?: string;
  ext: string;
}

export interface PhotoUploadResult {
  key: string;
  uploadUrl: string;
  token: string;
}

/**
 * Generate a storage key for a photo
 * Pattern: org/{tenantId}/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}
 */
export function generatePhotoKey(params: PhotoUploadParams): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const parts = [
    "org",
    params.tenantId,
    year,
    month,
    day,
    params.jobId || "misc",
    crypto.randomUUID() + "." + params.ext.replace(".", ""),
  ];

  return parts.join("/");
}

/**
 * Generate a storage key for NON-photo files (PDFs etc)
 * Pattern: org/{tenantId}/docs/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}
 */
export function generateFileKey(params: {
  tenantId: string;
  jobId?: string;
  ext: string;
  folder?: string; // default "docs"
}): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const folder = (params.folder || "docs").replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = params.ext.replace(".", "");

  const parts = [
    "org",
    params.tenantId,
    folder,
    year,
    month,
    day,
    params.jobId || "misc",
    crypto.randomUUID() + "." + ext,
  ];

  return parts.join("/");
}

/**
 * Create a signed upload URL for direct client uploads to Supabase Storage
 */
export async function createSignedUploadUrl(
  params: PhotoUploadParams
): Promise<PhotoUploadResult> {
  const storageClient = getStorageClient();
  const key = generatePhotoKey(params);

  const { data, error } = await storageClient
    .from(BUCKET_NAME)
    .createSignedUploadUrl(key);

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to create signed upload URL:", error);
    throw new Error(`Failed to create upload URL: ${error.message}`);
  }

  if (!data) {
    throw new Error("No upload URL returned from Supabase");
  }

  return {
    key,
    uploadUrl: data.signedUrl,
    token: data.token,
  };
}

/**
 * Create a signed URL for viewing/downloading a photo/file
 */
export async function createSignedViewUrl(
  key: string,
  expiresIn: number = 900
): Promise<string | null> {
  const storageClient = getStorageClient();
  const { data, error } = await storageClient
    .from(BUCKET_NAME)
    .createSignedUrl(key, expiresIn);

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to create signed view URL:", error);
    return null;
  }

  return data?.signedUrl || null;
}

/**
 * Upload a photo directly from server (for job photo uploads)
 */
export interface DirectUploadParams {
  tenantId: string;
  jobId?: string;
  ext: string;
  fileBuffer: Buffer;
  contentType?: string;
}

export interface DirectUploadResult {
  key: string;
}

export async function uploadPhotoToSupabase(
  params: DirectUploadParams
): Promise<DirectUploadResult> {
  const storageClient = getStorageClient();
  const key = generatePhotoKey({
    tenantId: params.tenantId,
    jobId: params.jobId,
    ext: params.ext,
  });

  const { error } = await storageClient.from(BUCKET_NAME).upload(key, params.fileBuffer, {
    contentType: params.contentType || "image/jpeg",
    upsert: false,
  });

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to upload photo:", error);
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  return { key };
}

/**
 * Upload a file directly from server (for PDFs like service sheets)
 * Generates a key under org/{tenantId}/docs/... unless you override folder
 */
export async function uploadFileToSupabase(params: {
  tenantId: string;
  jobId?: string;
  ext: string; // e.g. "pdf"
  fileBuffer: Buffer;
  contentType?: string; // e.g. "application/pdf"
  folder?: string; // default "docs"
}): Promise<{ key: string }> {
  const storageClient = getStorageClient();
  const key = generateFileKey({
    tenantId: params.tenantId,
    jobId: params.jobId,
    ext: params.ext,
    folder: params.folder || "docs",
  });

  const { error } = await storageClient.from(BUCKET_NAME).upload(key, params.fileBuffer, {
    contentType: params.contentType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to upload file:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return { key };
}

/**
 * Upload a file directly from server (for migration purposes)
 * NOTE: upsert true here by design.
 */
export async function uploadFile(
  key: string,
  fileBuffer: Buffer,
  contentType: string = "image/jpeg"
): Promise<boolean> {
  const storageClient = getStorageClient();
  const { error } = await storageClient.from(BUCKET_NAME).upload(key, fileBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to upload file:", error);
    return false;
  }

  return true;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<boolean> {
  const storageClient = getStorageClient();
  const { error } = await storageClient.from(BUCKET_NAME).remove([key]);

  if (error) {
    console.error("[SUPABASE_STORAGE] Failed to delete file:", error);
    return false;
  }

  return true;
}

/**
 * Ensure the photos bucket exists (call on startup)
 */
export async function ensurePhotoBucketExists(): Promise<void> {
  try {
    const storageClient = getStorageClient();
    const { data: buckets } = await storageClient.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (!exists) {
      console.log("[SUPABASE_STORAGE] Creating photos bucket...");
      const { error } = await storageClient.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 10485760, // 10MB
      });

      if (error) {
        console.error("[SUPABASE_STORAGE] Failed to create bucket:", error);
      } else {
        console.log("[SUPABASE_STORAGE] ✅ Photos bucket created");
      }
    } else {
      console.log("[SUPABASE_STORAGE] ✅ Photos bucket exists");
    }
  } catch (error: any) {
    console.error("[SUPABASE_STORAGE] Bucket check failed:", error.message);
  }
}

/**
 * List photo objects for a given job.
 * NOTE: Keep this minimal so builds pass and callers have a stable signature.
 * Your main jobs flow reads from the database, not directly from this.
 */
export async function listJobPhotos(
  tenantId: string,
  jobId: string
): Promise<Array<{ key: string; url?: string }>> {
  console.log(
    `[SUPABASE_STORAGE] listJobPhotos placeholder called tenant=${tenantId} job=${jobId}`
  );
  return [];
}