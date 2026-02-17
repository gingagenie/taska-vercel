/**
 * Test helpers - functions to create test data easily
 * 
 * These make it quick to set up test scenarios without writing
 * lots of repetitive INSERT statements in every test.
 */

import { db } from './test-db';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * Create a test organization
 * Returns the org object with { id, name }
 */
export async function createTestOrg(name = 'Test Org') {
  const result = await db.execute(sql`
    INSERT INTO orgs (name)
    VALUES (${name})
    RETURNING id, name
  `);
  return result[0];
}

/**
 * Create a test user in an organization
 * Returns the user object
 */
export async function createTestUser(orgId: string, data: {
  name?: string;
  email?: string;
  role?: string;
} = {}) {
  const email = data.email || `test-${nanoid(6)}@example.com`;
  const name = data.name || 'Test User';
  const role = data.role || 'admin';
  
  const result = await db.execute(sql`
    INSERT INTO users (org_id, email, name, role, password_hash)
    VALUES (${orgId}, ${email}, ${name}, ${role}, 'test-hash')
    RETURNING id, org_id, email, name, role
  `);
  return result[0];
}

/**
 * Create a test customer
 * Returns the customer object
 */
export async function createTestCustomer(orgId: string, data: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
} = {}) {
  const name = data.name || 'Test Customer';
  
  const result = await db.execute(sql`
    INSERT INTO customers (org_id, name, email, phone, address)
    VALUES (${orgId}, ${name}, ${data.email || null}, ${data.phone || null}, ${data.address || null})
    RETURNING id, org_id, name, email, phone, address
  `);
  return result[0];
}

/**
 * Create test equipment
 * Returns the equipment object
 */
export async function createTestEquipment(orgId: string, customerId: string, data: {
  name?: string;
  make?: string;
  model?: string;
  serviceIntervalMonths?: number | null;
} = {}) {
  const name = data.name || 'Test Equipment';
  
  const result = await db.execute(sql`
    INSERT INTO equipment (org_id, customer_id, name, make, model, service_interval_months)
    VALUES (
      ${orgId},
      ${customerId},
      ${name},
      ${data.make || null},
      ${data.model || null},
      ${data.serviceIntervalMonths ?? null}
    )
    RETURNING id, org_id, customer_id, name, make, model, service_interval_months
  `);
  return result[0];
}

/**
 * Create a test job
 * Returns the job object
 */
export async function createTestJob(orgId: string, data: {
  customerId?: string;
  title?: string;
  description?: string;
  status?: string;
  scheduledAt?: string;
  createdBy?: string;
} = {}) {
  const title = data.title || 'Test Job';
  const status = data.status || 'new';
  
  const result = await db.execute(sql`
    INSERT INTO jobs (
      org_id,
      customer_id,
      title,
      description,
      status,
      scheduled_at,
      created_by
    )
    VALUES (
      ${orgId},
      ${data.customerId || null},
      ${title},
      ${data.description || null},
      ${status},
      ${data.scheduledAt || null},
      ${data.createdBy || null}
    )
    RETURNING id, org_id, customer_id, title, description, status, scheduled_at, created_by
  `);
  return result[0];
}

/**
 * Add hours to a job
 */
export async function addJobHours(jobId: string, orgId: string, hours: number, description = 'Test hours') {
  const result = await db.execute(sql`
    INSERT INTO job_hours (job_id, org_id, hours, description)
    VALUES (${jobId}, ${orgId}, ${hours}, ${description})
    RETURNING id, job_id, hours, description
  `);
  return result[0];
}

/**
 * Add parts to a job
 */
export async function addJobPart(jobId: string, orgId: string, partName: string, quantity: number) {
  const result = await db.execute(sql`
    INSERT INTO job_parts (job_id, org_id, part_name, quantity)
    VALUES (${jobId}, ${orgId}, ${partName}, ${quantity})
    RETURNING id, job_id, part_name, quantity
  `);
  return result[0];
}

/**
 * Add a note to a job
 */
export async function addJobNote(jobId: string, orgId: string, text: string) {
  const result = await db.execute(sql`
    INSERT INTO job_notes (job_id, org_id, text)
    VALUES (${jobId}, ${orgId}, ${text})
    RETURNING id, job_id, text
  `);
  return result[0];
}

/**
 * Link equipment to a job
 */
export async function linkJobEquipment(jobId: string, equipmentId: string) {
  await db.execute(sql`
    INSERT INTO job_equipment (job_id, equipment_id)
    VALUES (${jobId}, ${equipmentId})
  `);
}

/**
 * Assign a technician to a job
 */
export async function assignJobTechnician(jobId: string, userId: string) {
  await db.execute(sql`
    INSERT INTO job_assignments (job_id, user_id)
    VALUES (${jobId}, ${userId})
  `);
}
