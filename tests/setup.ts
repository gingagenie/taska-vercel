/**
 * Test setup file - runs once before all tests
 * 
 * This file:
 * 1. Checks that DATABASE_URL_TEST is set (your separate test database)
 * 2. Clears all tables before each test run so tests start clean
 */

import { beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from './helpers/test-db';

// Make sure we're using the test database
if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    '❌ DATABASE_URL_TEST is not set!\n\n' +
    'You need a separate test database. Create one in Supabase and add to .env:\n' +
    'DATABASE_URL_TEST=postgresql://...\n'
  );
}

if (process.env.DATABASE_URL_TEST === process.env.DATABASE_URL) {
  throw new Error(
    '❌ DATABASE_URL_TEST cannot be the same as DATABASE_URL!\n\n' +
    'Your test database must be separate from production to avoid data loss.\n'
  );
}

console.log('✅ Test database configured');

/**
 * Clear all data before each test
 * This ensures every test starts with a clean slate
 */
beforeEach(async () => {
  // Delete all data from all tables (order matters due to foreign keys)
  await db.execute(sql`TRUNCATE TABLE 
    completed_job_photos,
    completed_job_equipment,
    completed_job_parts,
    completed_job_hours,
    completed_job_charges,
    completed_job_notes,
    completed_jobs,
    job_notifications,
    job_assignments,
    job_equipment,
    job_photos,
    job_hours,
    job_parts,
    job_charges,
    job_notes,
    jobs,
    equipment,
    customers,
    users,
    orgs
    CASCADE
  `);
});
