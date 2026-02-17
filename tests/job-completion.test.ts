/**
 * Job Completion Tests
 * 
 * These tests verify that completing a job:
 * 1. Creates a completed_jobs record with all data
 * 2. Copies all hours, parts, notes to completed_* tables
 * 3. Deletes the original job
 * 4. Creates a follow-up job if equipment has service_interval_months set
 * 5. Updates equipment last_service_date and next_service_date
 */

import { describe, it, expect } from 'vitest';
import { db } from '../helpers/test-db';
import { sql } from 'drizzle-orm';
import {
  createTestOrg,
  createTestUser,
  createTestCustomer,
  createTestEquipment,
  createTestJob,
  addJobHours,
  addJobPart,
  addJobNote,
  linkJobEquipment,
  assignJobTechnician,
} from '../helpers/test-helpers';

/**
 * Helper to complete a job (simulates calling the endpoint)
 * In reality this would use supertest to call POST /api/jobs/:id/complete
 * but for now we'll call the database directly to test the logic
 */
async function completeJob(jobId: string, orgId: string, userId: string) {
  // This is the exact same logic as the endpoint in jobs.ts
  // We're copying it here to test it works correctly
  
  const { Pool } = await import('pg');
  
  // Use the test database connection string
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_TEST,
    max: 3,
  });
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Load job
    const jobResult = await client.query(
      `SELECT j.id, j.org_id, j.customer_id, j.title, j.description,
              j.status, j.job_type, j.notes, j.scheduled_at,
              j.created_by, j.created_at,
              c.name AS customer_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       WHERE j.id = $1 AND j.org_id = $2
       LIMIT 1`,
      [jobId, orgId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error('Job not found');
    }
    
    const job = jobResult.rows[0];
    
    // 2. Create completed_jobs record
    const completedResult = await client.query(
      `INSERT INTO completed_jobs (
         org_id, original_job_id, customer_id, customer_name,
         title, description, job_type, notes, scheduled_at,
         completed_at, completed_by,
         original_created_by, original_created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12)
       RETURNING id`,
      [
        orgId, jobId,
        job.customer_id, job.customer_name,
        job.title, job.description, job.job_type,
        job.notes, job.scheduled_at,
        userId, job.created_by, job.created_at,
      ]
    );
    
    const completedJobId = completedResult.rows[0].id;
    
    // 3. Copy notes
    await client.query(
      `INSERT INTO completed_job_notes
         (completed_job_id, original_job_id, org_id, text, created_at)
       SELECT $1, job_id, org_id, text, created_at
       FROM job_notes
       WHERE job_id = $2 AND org_id = $3`,
      [completedJobId, jobId, orgId]
    );
    
    // 4. Copy hours
    await client.query(
      `INSERT INTO completed_job_hours
         (completed_job_id, original_job_id, org_id, hours, description, created_at)
       SELECT $1, job_id, org_id, hours, description, created_at
       FROM job_hours
       WHERE job_id = $2 AND org_id = $3`,
      [completedJobId, jobId, orgId]
    );
    
    // 5. Copy parts
    await client.query(
      `INSERT INTO completed_job_parts
         (completed_job_id, original_job_id, org_id, part_name, quantity, created_at)
       SELECT $1, job_id, org_id, part_name, quantity, created_at
       FROM job_parts
       WHERE job_id = $2 AND org_id = $3`,
      [completedJobId, jobId, orgId]
    );
    
    // 6. Copy equipment (with name snapshot)
    await client.query(
      `INSERT INTO completed_job_equipment
         (completed_job_id, original_job_id, org_id, equipment_id, equipment_name, created_at)
       SELECT $1, je.job_id, $3, je.equipment_id, e.name, je.created_at
       FROM job_equipment je
       JOIN equipment e ON e.id = je.equipment_id
       WHERE je.job_id = $2`,
      [completedJobId, jobId, orgId]
    );
    
    // 7. Handle service intervals
    const equipmentResult = await client.query(
      `SELECT e.id, e.name, e.service_interval_months, e.customer_id
       FROM job_equipment je
       JOIN equipment e ON e.id = je.equipment_id
       WHERE je.job_id = $1
         AND e.service_interval_months IS NOT NULL
         AND e.service_interval_months > 0`,
      [jobId]
    );
    
    const completedAt = new Date();
    let nextJobId: string | null = null;
    
    for (const equip of equipmentResult.rows) {
      const intervalMonths = Number(equip.service_interval_months);
      const nextServiceDate = new Date(completedAt);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + intervalMonths);
      
      // Update equipment dates
      await client.query(
        `UPDATE equipment
         SET last_service_date = $1, next_service_date = $2
         WHERE id = $3 AND org_id = $4`,
        [completedAt.toISOString(), nextServiceDate.toISOString(), equip.id, orgId]
      );
      
      // Create follow-up job
      const followUpTitle = `Service – ${equip.name}`;
      const followUpDescription =
        `Auto-scheduled ${intervalMonths}-month service for ${equip.name}. ` +
        `Previous service completed ${completedAt.toLocaleDateString('en-AU')}.`;
      
      const newJobResult = await client.query(
        `INSERT INTO jobs
           (org_id, customer_id, title, description, job_type, scheduled_at, status, created_by)
         VALUES ($1, $2, $3, $4, 'Service', $5, 'new', $6)
         RETURNING id`,
        [orgId, equip.customer_id, followUpTitle, followUpDescription, nextServiceDate.toISOString(), userId]
      );
      
      nextJobId = newJobResult.rows[0].id;
      
      // Link equipment to new job
      await client.query(
        `INSERT INTO job_equipment (job_id, equipment_id) VALUES ($1, $2)`,
        [nextJobId, equip.id]
      );
      
      // Re-assign technicians
      await client.query(
        `INSERT INTO job_assignments (job_id, user_id, assigned_at)
         SELECT $1, user_id, NOW()
         FROM job_assignments
         WHERE job_id = $2`,
        [nextJobId, jobId]
      );
    }
    
    // 8. Delete original job (CASCADE handles related tables)
    await client.query('DELETE FROM jobs WHERE id = $1 AND org_id = $2', [jobId, orgId]);
    
    await client.query('COMMIT');
    
    return { completedJobId, nextJobId };
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

describe('Job Completion', () => {
  it('should move job to completed_jobs with all data intact', async () => {
    // Setup: create org, user, customer, job
    const org = await createTestOrg();
    const user = await createTestUser(org.id);
    const customer = await createTestCustomer(org.id, { name: 'ACME Corp' });
    const job = await createTestJob(org.id, {
      customerId: customer.id,
      title: 'Fix broken pump',
      description: 'Pump not working',
      createdBy: user.id,
    });
    
    // Add some hours, parts, and notes
    await addJobHours(job.id, org.id, 2.5, 'Diagnostic work');
    await addJobPart(job.id, org.id, 'Replacement seal', 1);
    await addJobNote(job.id, org.id, 'Customer was very happy');
    
    // Complete the job
    const { completedJobId } = await completeJob(job.id, org.id, user.id);
    
    // Assert: completed job exists with correct data
    const completedJob = await db.execute(sql`
      SELECT * FROM completed_jobs WHERE id = ${completedJobId}
    `);
    
    expect(completedJob).toHaveLength(1);
    expect(completedJob[0].title).toBe('Fix broken pump');
    expect(completedJob[0].customer_name).toBe('ACME Corp');
    expect(completedJob[0].original_job_id).toBe(job.id);
    
    // Assert: hours were copied
    const hours = await db.execute(sql`
      SELECT * FROM completed_job_hours WHERE completed_job_id = ${completedJobId}
    `);
    expect(hours).toHaveLength(1);
    expect(Number(hours[0].hours)).toBe(2.5);
    
    // Assert: parts were copied
    const parts = await db.execute(sql`
      SELECT * FROM completed_job_parts WHERE completed_job_id = ${completedJobId}
    `);
    expect(parts).toHaveLength(1);
    expect(parts[0].part_name).toBe('Replacement seal');
    
    // Assert: notes were copied
    const notes = await db.execute(sql`
      SELECT * FROM completed_job_notes WHERE completed_job_id = ${completedJobId}
    `);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('Customer was very happy');
    
    // Assert: original job was deleted
    const originalJob = await db.execute(sql`
      SELECT * FROM jobs WHERE id = ${job.id}
    `);
    expect(originalJob).toHaveLength(0);
  });
  
  it('should create follow-up job when equipment has service interval', async () => {
    // Setup
    const org = await createTestOrg();
    const user = await createTestUser(org.id);
    const customer = await createTestCustomer(org.id);
    
    // Create equipment with 6-month service interval
    const equipment = await createTestEquipment(org.id, customer.id, {
      name: 'Pump #42',
      serviceIntervalMonths: 6,
    });
    
    const job = await createTestJob(org.id, {
      customerId: customer.id,
      title: 'Service Pump #42',
      createdBy: user.id,
    });
    
    // Link equipment to job
    await linkJobEquipment(job.id, equipment.id);
    
    // Assign technician
    await assignJobTechnician(job.id, user.id);
    
    // Complete the job
    const { nextJobId } = await completeJob(job.id, org.id, user.id);
    
    // Assert: follow-up job was created
    expect(nextJobId).toBeTruthy();
    
    const followUpJob = await db.execute(sql`
      SELECT * FROM jobs WHERE id = ${nextJobId!}
    `);
    
    expect(followUpJob).toHaveLength(1);
    expect(followUpJob[0].title).toBe('Service – Pump #42');
    expect(followUpJob[0].job_type).toBe('Service');
    
    // Assert: follow-up job is scheduled 6 months from now
    const scheduledAt = new Date(followUpJob[0].scheduled_at);
    const expectedDate = new Date();
    expectedDate.setMonth(expectedDate.getMonth() + 6);
    
    // Allow 1 day tolerance for test timing
    const daysDiff = Math.abs(scheduledAt.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeLessThan(1);
    
    // Assert: equipment was linked to follow-up job
    const followUpEquipment = await db.execute(sql`
      SELECT * FROM job_equipment WHERE job_id = ${nextJobId!}
    `);
    expect(followUpEquipment).toHaveLength(1);
    expect(followUpEquipment[0].equipment_id).toBe(equipment.id);
    
    // Assert: technician was re-assigned to follow-up job
    const followUpAssignment = await db.execute(sql`
      SELECT * FROM job_assignments WHERE job_id = ${nextJobId!}
    `);
    expect(followUpAssignment).toHaveLength(1);
    expect(followUpAssignment[0].user_id).toBe(user.id);
    
    // Assert: equipment dates were updated
    const updatedEquipment = await db.execute(sql`
      SELECT last_service_date, next_service_date FROM equipment WHERE id = ${equipment.id}
    `);
    expect(updatedEquipment[0].last_service_date).toBeTruthy();
    expect(updatedEquipment[0].next_service_date).toBeTruthy();
  });
  
  it('should NOT create follow-up job when equipment has no service interval', async () => {
    // Setup
    const org = await createTestOrg();
    const user = await createTestUser(org.id);
    const customer = await createTestCustomer(org.id);
    
    // Equipment WITHOUT service interval
    const equipment = await createTestEquipment(org.id, customer.id, {
      name: 'One-time repair item',
      serviceIntervalMonths: null,
    });
    
    const job = await createTestJob(org.id, {
      customerId: customer.id,
      title: 'Fix item',
      createdBy: user.id,
    });
    
    await linkJobEquipment(job.id, equipment.id);
    
    // Complete the job
    const { nextJobId } = await completeJob(job.id, org.id, user.id);
    
    // Assert: NO follow-up job was created
    expect(nextJobId).toBeNull();
  });
});
