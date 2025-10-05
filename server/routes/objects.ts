import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  objectStorageClient,
} from "../objectStorage";
import { Client } from "@replit/object-storage";

const router = Router();

// Extract bucket ID from PRIVATE_OBJECT_DIR
function getBucketId(): string | null {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    console.error("[REPLIT_STORAGE] PRIVATE_OBJECT_DIR not set");
    return null;
  }
  // Format: /replit-objstore-{uuid}/.private
  // Extract: replit-objstore-{uuid}
  const match = privateDir.match(/\/(replit-objstore-[a-f0-9-]+)/);
  if (!match) {
    console.error("[REPLIT_STORAGE] Could not extract bucket ID from:", privateDir);
    return null;
  }
  return match[1];
}

// Initialize Replit storage client lazily
let replitStorage: Client | null = null;
function getReplitStorage(): Client | null {
  if (!replitStorage) {
    try {
      const bucketId = getBucketId();
      if (!bucketId) {
        return null;
      }
      replitStorage = new Client(bucketId);
      console.log(`[REPLIT_STORAGE] ✅ Client initialized with bucket: ${bucketId}`);
    } catch (e) {
      console.error("[REPLIT_STORAGE] Failed to initialize client:", e);
      return null;
    }
  }
  return replitStorage;
}

// This endpoint is used to serve public objects.
router.get("/public-objects/:filePath(*)", async (req, res) => {
  const filePath = req.params.filePath;
  const objectStorageService = new ObjectStorageService();
  try {
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    objectStorageService.downloadObject(file, res);
  } catch (error) {
    console.error("Error searching for public object:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// This endpoint serves private objects with org-based authentication
router.get("/:objectPath(*)", requireAuth, requireOrg, async (req, res) => {
  try {
    const requestedPath = req.params.objectPath;
    const userOrgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    
    // Extract orgId from path (format: job-photos/{orgId}/{jobId}/{file})
    const pathSegments = requestedPath.split('/');
    if (pathSegments.length < 2) {
      return res.status(400).json({ error: "Invalid object path" });
    }
    
    // For job-photos, the orgId is the second segment
    const pathOrgId = pathSegments[1];
    
    // Strict org check - user can only access their org's photos
    if (userOrgId !== pathOrgId) {
      const { logStorage } = await import("../storage/log");
      logStorage("VIEW_FORBIDDEN", { who: userId, key: requestedPath, userOrg: userOrgId, pathOrg: pathOrgId });
      return res.status(403).json({ error: "Forbidden" });
    }
    
    // Import storage modules
    const { absolutePathForKey, disableObjectStorage } = await import("../storage/paths");
    const { logStorage } = await import("../storage/log");
    const fs = await import("node:fs");
    
    // Get absolute path for the key
    const key = requestedPath;
    let absolutePath = absolutePathForKey(key);
    
    // Try filesystem first (fast path when mount works)
    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
      const stream = fs.createReadStream(absolutePath);
      
      stream.on("error", (e: any) => {
        logStorage("VIEW_ERROR", { who: userId, key, msg: e?.message });
        return res.status(500).json({ error: "Read error" });
      });
      
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      stream.pipe(res);
      logStorage("VIEW_OK", { who: userId, key, source: "filesystem" });
      return;
    } catch (accessError: any) {
      // Filesystem failed - try Replit HTTP API as fallback
      if (accessError?.code === "ENOENT" || accessError?.code === "EACCES") {
        console.log(`[PHOTO_RETRIEVAL] Filesystem mount unavailable for ${key}, trying Replit HTTP API...`);
        
        try {
          // Try Google Cloud Storage client directly
          console.log(`[PHOTO_RETRIEVAL] Trying GCS client for key: ${key}`);
          
          const bucketId = getBucketId();
          if (!bucketId) {
            console.error(`[PHOTO_RETRIEVAL] Could not get bucket ID`);
          } else {
            const bucket = objectStorageClient.bucket(bucketId);
            const file = bucket.file(key);
            
            const [exists] = await file.exists();
            if (exists) {
              console.log(`[PHOTO_RETRIEVAL] File exists in GCS, downloading...`);
              const [buffer] = await file.download();
              
              console.log(`[PHOTO_RETRIEVAL] Successfully retrieved ${buffer.length} bytes from GCS`);
              res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
              res.setHeader("Content-Type", "image/jpeg");
              res.send(buffer);
              logStorage("VIEW_OK", { who: userId, key, source: "gcs-client" });
              console.log(`[PHOTO_RETRIEVAL] Successfully sent photo via GCS client`);
              return;
            } else {
              console.error(`[PHOTO_RETRIEVAL] File does not exist in GCS: ${key}`);
            }
          }
        } catch (gcsError: any) {
          console.error(`[PHOTO_RETRIEVAL] GCS client exception for ${key}:`, gcsError.message, gcsError.stack);
        }
        
        // Last resort: try local fallback
        disableObjectStorage();
        absolutePath = absolutePathForKey(key);
        
        try {
          await fs.promises.access(absolutePath, fs.constants.R_OK);
          const stream = fs.createReadStream(absolutePath);
          
          stream.on("error", (e: any) => {
            logStorage("VIEW_ERROR", { who: userId, key, msg: e?.message });
            return res.status(500).json({ error: "Read error" });
          });
          
          res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
          stream.pipe(res);
          logStorage("VIEW_OK", { who: userId, key, source: "local-fallback" });
          return;
        } catch (fallbackError: any) {
          logStorage("VIEW_NOT_FOUND", { who: userId, key });
          console.error(`[PHOTO_RETRIEVAL] All retrieval methods failed for ${key}`);
          return res.status(404).json({ error: "Not found" });
        }
      } else {
        logStorage("VIEW_ERROR", { who: userId, key, msg: accessError?.message });
        return res.status(500).json({ error: "Read error" });
      }
    }
  } catch (error: any) {
    console.error("Error serving object:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// This endpoint is used to get the upload URL for an object entity.
router.post("/upload", requireAuth, async (req, res) => {
  const objectStorageService = new ObjectStorageService();
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  res.json({ uploadURL });
});

// This endpoint converts a logo upload URL to object path and sets ACL
router.put("/logo", requireAuth, requireOrg, async (req, res) => {
  const { logoURL } = req.body;
  
  if (!logoURL) {
    return res.status(400).json({ error: "logoURL is required" });
  }

  try {
    const objectStorageService = new ObjectStorageService();
    const objectPath = objectStorageService.normalizeObjectEntityPath(logoURL);

    res.json({ objectPath });
  } catch (error) {
    console.error("Error setting logo path:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Diagnostic endpoint for logo issues
router.get("/diagnostics/:objectPath(*)", async (req, res) => {
  try {
    const fullPath = `/objects/${req.params.objectPath}`;
    const objectStorageService = new ObjectStorageService();
    
    let storageExists = false;
    let bytes = 0;
    let contentType = null;
    let storageError = null;
    let metadata = null;

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(fullPath);
      const [fileMeta] = await objectFile.getMetadata();
      
      storageExists = true;
      bytes = parseInt(String(fileMeta.size || '0'));
      contentType = fileMeta.contentType;
      metadata = fileMeta;
      
    } catch (error: any) {
      storageError = error.message;
      if (error instanceof ObjectNotFoundError) {
        storageExists = false;
      }
    }

    res.json({
      requestedPath: fullPath,
      storage: {
        exists: storageExists,
        bytes,
        contentType,
        error: storageError,
        metadata: metadata
      },
      recommendations: [
        "Object path should be like /objects/uploads/<uuid>",
        "Check if object exists in Google Cloud Storage",
        "If bytes=0, re-upload the file",
        "Ensure proper ACL policy is set for public access"
      ]
    });
  } catch (error: any) {
    console.error("Diagnostic error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;