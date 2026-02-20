/**
 * Backfill Script: Pre-generate service sheet PDFs for existing completed jobs
 * 
 * Run this once after deploying the PDF storage feature to backfill all historical jobs.
 * 
 * Usage:
 *   node dist/scripts/backfill-service-pdfs.js
 */

import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { generateServiceSheetPDF } from '../lib/service-sheet-generator';
import { uploadFileToSupabase } from '../services/supabase';

async function backfillServicePDFs() {
  console.log('🔍 Finding completed jobs without stored PDFs...\n');

  try {
    // Find all completed jobs that don't have a PDF stored yet
    const jobsWithoutPDFs: any = await db.execute(sql`
      SELECT id, org_id, customer_name, title, completed_at
      FROM completed_jobs
      WHERE service_sheet_pdf_key IS NULL
      ORDER BY completed_at DESC
    `);

    const total = jobsWithoutPDFs.length;
    console.log(`📋 Found ${total} jobs to process\n`);

    if (total === 0) {
      console.log('✅ All jobs already have PDFs stored!');
      return;
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ jobId: string; error: string }> = [];

    for (const job of jobsWithoutPDFs) {
      processed++;
      const jobId = job.id;
      const orgId = job.org_id;

      try {
        console.log(`[${processed}/${total}] Processing job ${jobId}...`);
        console.log(`  Customer: ${job.customer_name || 'N/A'}`);
        console.log(`  Title: ${job.title}`);
        console.log(`  Completed: ${job.completed_at}`);

        // Generate PDF
        console.log(`  → Generating PDF...`);
        const pdfBuffer = await generateServiceSheetPDF(jobId, orgId);

        // Upload to Supabase Storage
        console.log(`  → Uploading to Supabase Storage...`);
        const { key } = await uploadFileToSupabase({
          tenantId: orgId,
          jobId: jobId,
          ext: 'pdf',
          fileBuffer: pdfBuffer,
          contentType: 'application/pdf',
          folder: 'service-sheets',
        });

        // Update database with the storage key
        console.log(`  → Updating database...`);
        await db.execute(sql`
          UPDATE completed_jobs 
          SET service_sheet_pdf_key = ${key}
          WHERE id = ${jobId}::uuid
        `);

        succeeded++;
        console.log(`  ✅ Success! Stored at: ${key}\n`);

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err: any) {
        failed++;
        const errorMsg = err?.message || 'Unknown error';
        errors.push({ jobId, error: errorMsg });
        console.error(`  ❌ Failed: ${errorMsg}\n`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total jobs: ${total}`);
    console.log(`✅ Succeeded: ${succeeded}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    if (errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      errors.forEach(({ jobId, error }) => {
        console.log(`  - Job ${jobId}: ${error}`);
      });
    }

    console.log('\n🎉 All done! Service sheet downloads will now be instant.');

  } catch (err: any) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  }
}

// Run the backfill
backfillServicePDFs()
  .then(() => {
    console.log('\n✨ Exiting...');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Unexpected error:', err);
    process.exit(1);
  });
