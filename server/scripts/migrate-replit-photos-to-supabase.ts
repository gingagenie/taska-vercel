#!/usr/bin/env tsx

/**
 * Migration script to copy ALL photos from Replit GCS to Supabase Storage
 * and update database URLs to point to Supabase
 */

import { objectStorageClient } from "../objectStorage";
import { uploadFile } from "../services/supabase-storage";
import { db } from "../db/client";
import { completedJobPhotos } from "../../shared/schema";
import { sql } from "drizzle-orm";
import path from "node:path";
import crypto from "node:crypto";

async function migrateAllPhotos() {
  console.log("🚀 Starting complete photo migration from Replit GCS to Supabase...\n");
  
  // Get bucket ID
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR not set");
  }
  
  const match = privateDir.match(/\/(replit-objstore-[a-f0-9-]+)/);
  if (!match) {
    throw new Error(`Could not extract bucket ID from: ${privateDir}`);
  }
  
  const bucketId = match[1];
  console.log(`📦 Using bucket: ${bucketId}\n`);
  
  // List ALL files with job-photos prefix
  const bucket = objectStorageClient.bucket(bucketId);
  const [files] = await bucket.getFiles({ prefix: 'job-photos/' });
  
  console.log(`📊 Found ${files.length} photos in Replit GCS\n`);
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (const file of files) {
    const gcsKey = file.name;
    console.log(`\n📸 Processing: ${gcsKey}`);
    
    try {
      // Download from GCS
      const [buffer] = await file.download();
      console.log(`  ✅ Downloaded ${buffer.length} bytes from GCS`);
      
      // Parse the path: job-photos/{orgId}/{jobId}/{filename}
      const parts = gcsKey.split('/');
      if (parts.length !== 4) {
        console.log(`  ⏭️  Skipping - unexpected path format`);
        skipCount++;
        continue;
      }
      
      const [, orgId, jobId, filename] = parts;
      const ext = path.extname(filename).replace(".", "") || "jpg";
      
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
      
      // Generate Supabase key: org/{orgId}/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      const supabaseKey = [
        'org',
        orgId,
        year,
        month,
        day,
        jobId,
        crypto.randomUUID() + '.' + ext
      ].join('/');
      
      // Upload to Supabase
      const uploaded = await uploadFile(supabaseKey, buffer, contentType);
      
      if (!uploaded) {
        console.log(`  ❌ Failed to upload to Supabase`);
        failCount++;
        continue;
      }
      
      console.log(`  ✅ Uploaded to Supabase: ${supabaseKey}`);
      
      // Update database - find completed_job_photos with this GCS path and update to Supabase URL
      const oldUrl = `/api/objects/${gcsKey}`;
      const newUrl = `/api/media/${supabaseKey}`; // This will be the new URL pattern
      
      // For now, just store the Supabase key in the URL field
      // We'll need to track which photos have been migrated
      const result = await db.execute(sql`
        UPDATE completed_job_photos 
        SET url = ${supabaseKey}
        WHERE url LIKE ${`%${jobId}%${filename.replace('.jpg.jpg', '%')}`}
      `);
      
      console.log(`  ✅ Updated database URLs`);
      
      successCount++;
      
    } catch (error: any) {
      console.error(`  ❌ Error migrating ${gcsKey}:`, error.message);
      failCount++;
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 Migration Summary:");
  console.log("=".repeat(60));
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`⏭️  Skipped:              ${skipCount}`);
  console.log(`❌ Failed:                ${failCount}`);
  console.log(`📈 Total:                 ${files.length}`);
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
migrateAllPhotos().catch((error) => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
