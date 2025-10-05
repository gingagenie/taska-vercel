#!/usr/bin/env tsx

/**
 * Migration script to copy all existing Replit Object Storage photos to Supabase Storage
 * 
 * This script:
 * 1. Fetches all job_photos records that don't have a media_id (legacy Replit photos)
 * 2. Downloads each photo from Replit storage
 * 3. Uploads to Supabase Storage
 * 4. Creates media record
 * 5. Updates job_photos record with media_id
 * 
 * Usage: tsx server/scripts/migrate-photos-to-supabase.ts
 */

import { db } from "../db/client";
import { jobPhotos, media } from "../../shared/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { uploadFile } from "../services/supabase-storage";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Import Google Cloud Storage client for Replit retrieval
async function getPhotoBuffer(objectKey: string): Promise<Buffer | null> {
  try {
    const { objectStorageClient } = await import("../objectStorage");
    
    // Extract bucket ID from PRIVATE_OBJECT_DIR
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    
    const match = privateDir.match(/\/(replit-objstore-[a-f0-9-]+)/);
    if (!match) {
      throw new Error(`Could not extract bucket ID from: ${privateDir}`);
    }
    
    const bucketId = match[1];
    const bucket = objectStorageClient.bucket(bucketId);
    const file = bucket.file(objectKey);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`❌ File not found in GCS: ${objectKey}`);
      return null;
    }
    
    // Download the file
    const [buffer] = await file.download();
    console.log(`✅ Downloaded from GCS: ${objectKey} (${buffer.length} bytes)`);
    return buffer;
  } catch (error: any) {
    console.error(`❌ Failed to read photo ${objectKey}:`, error.message);
    return null;
  }
}

async function migratePhotos() {
  console.log("🚀 Starting photo migration from Replit to Supabase...\n");
  
  // Find all job_photos without media_id (legacy Replit photos)
  const legacyPhotos = await db
    .select()
    .from(jobPhotos)
    .where(isNull(jobPhotos.mediaId));
  
  console.log(`📊 Found ${legacyPhotos.length} legacy photos to migrate\n`);
  
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  
  for (const photo of legacyPhotos) {
    const key = photo.objectKey;
    
    if (!key) {
      console.log(`⏭️  Skipping photo ${photo.id} - no object_key`);
      skipCount++;
      continue;
    }
    
    console.log(`\n📸 Processing: ${key}`);
    
    try {
      // Download from Replit
      const buffer = await getPhotoBuffer(key);
      
      if (!buffer) {
        console.log(`❌ Failed to download: ${key}`);
        failCount++;
        continue;
      }
      
      // Extract extension from key
      const ext = path.extname(key).replace(".", "") || "jpg";
      
      // Determine content type
      const contentTypeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
      };
      const contentType = contentTypeMap[ext.toLowerCase()] || "image/jpeg";
      
      // Generate new Supabase key following pattern: org/{orgId}/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      const newKey = [
        'org',
        photo.orgId,
        year,
        month,
        day,
        photo.jobId,
        crypto.randomUUID() + '.' + ext
      ].join('/');
      
      // Upload to Supabase
      const uploaded = await uploadFile(newKey, buffer, contentType);
      
      if (!uploaded) {
        console.log(`❌ Failed to upload to Supabase: ${key}`);
        failCount++;
        continue;
      }
      
      console.log(`✅ Uploaded to Supabase: ${newKey}`);
      
      // Create media record
      const [mediaRecord] = await db.insert(media).values({
        orgId: photo.orgId,
        jobId: photo.jobId,
        key: newKey,
        kind: "photo",
        ext,
        bytes: buffer.length,
        isPublic: false,
      }).returning();
      
      console.log(`✅ Created media record: ${mediaRecord.id}`);
      
      // Update job_photos with media_id AND new Supabase URL
      const newUrl = `/api/media/${mediaRecord.id}/url`;
      await db.execute(sql`
        UPDATE job_photos 
        SET media_id = ${mediaRecord.id},
            url = ${newUrl}
        WHERE id = ${photo.id}
      `);
      
      console.log(`✅ Updated job_photos record with Supabase URL: ${newUrl}`);
      
      successCount++;
      
    } catch (error: any) {
      console.error(`❌ Error migrating ${key}:`, error.message);
      failCount++;
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 Migration Summary:");
  console.log("=".repeat(60));
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`⏭️  Skipped (no key):      ${skipCount}`);
  console.log(`❌ Failed:                ${failCount}`);
  console.log(`📈 Total:                 ${legacyPhotos.length}`);
  console.log("=".repeat(60));
  
  if (failCount > 0) {
    console.log("\n⚠️  Some photos failed to migrate. Check logs above for details.");
    process.exit(1);
  } else {
    console.log("\n🎉 All photos migrated successfully!");
    process.exit(0);
  }
}

// Run migration
migratePhotos().catch((error) => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
