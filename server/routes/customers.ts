import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";

export const customers = Router();
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limitimport { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";
import bcrypt from "bcryptjs";

export const customers = Router();
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Generate random password helper
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* LIST */
customers.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where org_id = ${orgId}::uuid
      order by name asc
    `);
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customers" });
  }
});

/* GET ONE */
customers.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where id = ${id}::uuid and org_id = ${orgId}::uuid
    `);
    const row = r?.[0];
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (error: any) {
    console.error("GET /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customer" });
  }
});

/* CREATE */
customers.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId; // guaranteed after requireOrg
  console.log("[TRACE] POST /api/customers org=%s", orgId);
  
  // Org validation handled by tenant guard
  
  const { name, contact_name, email, phone, street, suburb, state, postcode, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  try {
    const result: any = await db.execute(sql`
      insert into customers (
        org_id, name, contact_name, email, phone, street, suburb, state, postcode, notes
      ) values (
        ${orgId}::uuid, ${name}, ${contact_name||null}, ${email||null}, ${phone||null}, ${street||null}, ${suburb||null}, ${state||null}, ${postcode||null}, ${notes||null}
      )
      returning id, name, contact_name, email, phone, street, suburb, state, postcode, notes, created_at
    `);

    const customer = result[0];

    // Track TikTok Lead event for customer creation (fire and forget - non-blocking)
    try {
      const customerInfo: CustomerInfo = {
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        firstName: customer.contact_name?.split(' ')[0] || undefined,
        lastName: customer.contact_name?.split(' ').slice(1).join(' ') || undefined,
        city: customer.suburb || undefined,
        state: customer.state || undefined,
        country: 'AU', // Default to Australia for Taska
        zipCode: customer.postcode || undefined,
        ip: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.get('User-Agent') || undefined,
      };

      const leadData = {
        value: 500, // Estimated customer lifetime value for field service business
        currency: 'AUD',
        contentName: 'New Customer Lead',
        contentCategory: 'lead_generation',
        contentType: 'lead_generation',
        description: `Customer created with ID: ${customer.id}`,
        status: 'qualified',
      };

      // Fire and forget - don't wait for response to avoid slowing down customer creation
      tiktokEvents.trackLead(
        customerInfo,
        leadData,
        req.get('Referer') || undefined,
        req.get('Referer') || undefined
      ).catch((trackingError) => {
        // Log tracking errors but don't throw them
        console.error('[CUSTOMER_CREATION] TikTok Lead tracking failed:', trackingError);
      });

      console.log(`[CUSTOMER_CREATION] TikTok Lead tracking initiated for customer_id: ${customer.id}`);
    } catch (trackingError) {
      // Log any tracking errors but don't let them break customer creation
      console.error('[CUSTOMER_CREATION] TikTok tracking error:', trackingError);
    }

    res.json({ ok: true, customer });
  } catch (error: any) {
    console.error("POST /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to create customer" });
  }
});

/* UPDATE */
customers.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { id } = req.params;
  console.log("[TRACE] PUT /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const { name, contact_name, email, phone, street, suburb, state, postcode } = req.body || {};
  
  try {
    await db.execute(sql`
      update customers set
        name         = coalesce(${name}, name),
        contact_name = coalesce(${contact_name}, contact_name),
        email        = coalesce(${email}, email),
        phone        = coalesce(${phone}, phone),
        street       = coalesce(${street}, street),
        suburb       = coalesce(${suburb}, suburb),
        state        = coalesce(${state}, state),
        postcode     = coalesce(${postcode}, postcode)
      where id=${id}::uuid and org_id = ${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to update customer" });
  }
});

/* DELETE */
customers.delete("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] DELETE /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    // Check if customer has any associated jobs
    const jobCheck: any = await db.execute(sql`
      select count(*) as job_count 
      from jobs 
      where customer_id=${id}::uuid and org_id = ${orgId}::uuid
    `);
    
    const jobCount = parseInt(String(jobCheck[0]?.job_count || "0"));
    
    if (jobCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete customer. They have ${jobCount} associated job${jobCount > 1 ? 's' : ''}.` 
      });
    }

    // Safe to delete - no associated jobs
    await db.execute(sql`
      delete from customers
      where id=${id}::uuid and org_id = ${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete customer" });
  }
});

/* GENERATE PORTAL LOGIN */
customers.post(
  "/:id/generate-portal-login",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const { id } = req.params;
    const orgId = (req as any).orgId;

    if (!isUuid(id)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    try {
      // Check if customer exists
      const customerResult: any = await db.execute(sql`
        SELECT id, name, email, org_id
        FROM customers
        WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid
        LIMIT 1
      `);

      if (!customerResult.length) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const customer = customerResult[0];

      if (!customer.email) {
        return res.status(400).json({ 
          error: "Customer must have an email address to create portal login" 
        });
      }

      // Check if portal login already exists
      const existingLogin: any = await db.execute(sql`
        SELECT id, email
        FROM customer_users
        WHERE customer_id = ${id}::uuid AND org_id = ${orgId}::uuid
        LIMIT 1
      `);

      if (existingLogin.length > 0) {
        return res.status(400).json({ 
          error: "Portal login already exists for this customer",
          existingEmail: existingLogin[0].email
        });
      }

      // Get org slug for URL
      const orgResult: any = await db.execute(sql`
        SELECT slug FROM orgs WHERE id = ${orgId}::uuid LIMIT 1
      `);

      if (!orgResult.length) {
        return res.status(500).json({ error: "Organization not found" });
      }

      const orgSlug = orgResult[0].slug;

      // Generate random password
      const password = generatePassword(12);
      const passwordHash = await bcrypt.hash(password, 10);

      // Create customer_user
      await db.execute(sql`
        INSERT INTO customer_users (org_id, customer_id, email, password_hash, name)
        VALUES (
          ${orgId}::uuid,
          ${id}::uuid,
          ${customer.email},
          ${passwordHash},
          ${customer.name + ' Portal'}
        )
      `);

      // Construct portal URL
      const portalUrl = `${req.protocol}://${req.get('host')}/portal/${orgSlug}/login`;

      res.json({
        success: true,
        email: customer.email,
        password: password,
        url: portalUrl,
        message: "Portal login created successfully"
      });

    } catch (error: any) {
      console.error("Error generating portal login:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate portal login" 
      });
    }
  }
);

/* CSV IMPORT */
customers.post("/import-csv", requireAuth, requireOrg, upload.single('csvFile'), async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] POST /api/customers/import-csv org=%s", orgId);
  if (!req.file) {
    return res.status(400).json({ error: "No CSV file uploaded" });
  }

  try {
    // Double-check org existence
    const ok: any = await db.execute(sql`select 1 from orgs where id=${orgId}::uuid`);
    if (!ok || ok.length === 0) {
      console.log(`[AUTH] 400 - Invalid org at CSV import: orgId=${orgId}`);
      return res.status(400).json({ error: "Invalid org" });
    }

    // Handle different encodings and remove BOM
    let csvContent = req.file.buffer.toString('utf-8');
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1); // Remove BOM
    }
    
    
    const records: any[] = [];
    
    // Parse CSV with flexible separators
    const readable = Readable.from([csvContent]);
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [',', ';', '\t'], // Try multiple separators
      relax_quotes: true,
      escape: '"'
    });

    readable.pipe(parser);

    for await (const record of parser) {
      records.push(record);
    }


    if (records.length === 0) {
      return res.status(400).json({ error: "No valid records found in CSV" });
    }

    let imported = 0;
    let errors: string[] = [];

    // Process each record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNum = i + 2; // +2 because CSV header is row 1, data starts at row 2
      
      try {
        const { name, email, phone, address, contact_name, street, suburb, state, postcode, notes } = record;
        
        
        if (!name?.trim()) {
          errors.push(`Row ${rowNum}: Missing required field 'name'`);
          continue;
        }

        // Insert customer
        await db.execute(sql`
          insert into customers (
            org_id, name, contact_name, email, phone, address, street, suburb, state, postcode, notes
          ) values (
            ${orgId}::uuid, ${name}, ${contact_name||null}, ${email||null}, ${phone||null}, ${address||null}, ${street||null}, ${suburb||null}, ${state||null}, ${postcode||null}, ${notes||null}
          )
        `);

        imported++;
      } catch (error: any) {
        errors.push(`Row ${rowNum}: ${error.message}`);
      }
    }

    // Track TikTok Lead event for successful CSV import (fire and forget - non-blocking)
    if (imported > 0) {
      try {
        const customerInfo: CustomerInfo = {
          ip: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.get('User-Agent') || undefined,
          country: 'AU', // Default to Australia for Taska
        };

        const leadData = {
          value: imported * 500, // Estimated customer lifetime value per imported customer
          currency: 'AUD',
          contentName: 'Bulk Customer Import Lead',
          contentCategory: 'lead_generation',
          contentType: 'lead_generation',
          description: `CSV import completed: ${imported} customers imported from ${records.length} records`,
          status: 'qualified',
        };

        // Fire and forget - don't wait for response to avoid slowing down import response
        tiktokEvents.trackLead(
          customerInfo,
          leadData,
          req.get('Referer') || undefined,
          req.get('Referer') || undefined
        ).catch((trackingError) => {
          // Log tracking errors but don't throw them
          console.error('[CSV_IMPORT] TikTok Lead tracking failed:', trackingError);
        });

        console.log(`[CSV_IMPORT] TikTok Lead tracking initiated for bulk import: ${imported} customers (Total value: $${imported * 500})`);
      } catch (trackingError) {
        // Log any tracking errors but don't let them break CSV import
        console.error('[CSV_IMPORT] TikTok tracking error:', trackingError);
      }
    }

    res.json({
      ok: true,
      imported,
      total: records.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("POST /api/customers/import-csv error:", error);
    res.status(500).json({ error: error?.message || "Failed to import CSV" });
  }
});

export { customers as default };
});

/* LIST */
customers.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where org_id = ${orgId}::uuid
      order by name asc
    `);
    res.json(r);
  } catch (error: any) {
    console.error("GET /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customers" });
  }
});

/* GET ONE */
customers.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where id = ${id}::uuid and org_id = ${orgId}::uuid
    `);
    const row = r?.[0];
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (error: any) {
    console.error("GET /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customer" });
  }
});

/* CREATE */
customers.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId; // guaranteed after requireOrg
  console.log("[TRACE] POST /api/customers org=%s", orgId);
  
  // Org validation handled by tenant guard
  
  const { name, contact_name, email, phone, street, suburb, state, postcode, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  try {
    const result: any = await db.execute(sql`
      insert into customers (
        org_id, name, contact_name, email, phone, street, suburb, state, postcode, notes
      ) values (
        ${orgId}::uuid, ${name}, ${contact_name||null}, ${email||null}, ${phone||null}, ${street||null}, ${suburb||null}, ${state||null}, ${postcode||null}, ${notes||null}
      )
      returning id, name, contact_name, email, phone, street, suburb, state, postcode, notes, created_at
    `);

    const customer = result[0];

    // Track TikTok Lead event for customer creation (fire and forget - non-blocking)
    try {
      const customerInfo: CustomerInfo = {
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        firstName: customer.contact_name?.split(' ')[0] || undefined,
        lastName: customer.contact_name?.split(' ').slice(1).join(' ') || undefined,
        city: customer.suburb || undefined,
        state: customer.state || undefined,
        country: 'AU', // Default to Australia for Taska
        zipCode: customer.postcode || undefined,
        ip: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.get('User-Agent') || undefined,
      };

      const leadData = {
        value: 500, // Estimated customer lifetime value for field service business
        currency: 'AUD',
        contentName: 'New Customer Lead',
        contentCategory: 'lead_generation',
        contentType: 'lead_generation',
        description: `Customer created with ID: ${customer.id}`,
        status: 'qualified',
      };

      // Fire and forget - don't wait for response to avoid slowing down customer creation
      tiktokEvents.trackLead(
        customerInfo,
        leadData,
        req.get('Referer') || undefined,
        req.get('Referer') || undefined
      ).catch((trackingError) => {
        // Log tracking errors but don't throw them
        console.error('[CUSTOMER_CREATION] TikTok Lead tracking failed:', trackingError);
      });

      console.log(`[CUSTOMER_CREATION] TikTok Lead tracking initiated for customer_id: ${customer.id}`);
    } catch (trackingError) {
      // Log any tracking errors but don't let them break customer creation
      console.error('[CUSTOMER_CREATION] TikTok tracking error:', trackingError);
    }

    res.json({ ok: true, customer });
  } catch (error: any) {
    console.error("POST /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to create customer" });
  }
});

/* UPDATE */
customers.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { id } = req.params;
  console.log("[TRACE] PUT /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const { name, contact_name, email, phone, street, suburb, state, postcode } = req.body || {};
  
  try {
    await db.execute(sql`
      update customers set
        name         = coalesce(${name}, name),
        contact_name = coalesce(${contact_name}, contact_name),
        email        = coalesce(${email}, email),
        phone        = coalesce(${phone}, phone),
        street       = coalesce(${street}, street),
        suburb       = coalesce(${suburb}, suburb),
        state        = coalesce(${state}, state),
        postcode     = coalesce(${postcode}, postcode)
      where id=${id}::uuid and org_id = ${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to update customer" });
  }
});

/* DELETE */
customers.delete("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] DELETE /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    // Check if customer has any associated jobs
    const jobCheck: any = await db.execute(sql`
      select count(*) as job_count 
      from jobs 
      where customer_id=${id}::uuid and org_id = ${orgId}::uuid
    `);
    
    const jobCount = parseInt(String(jobCheck[0]?.job_count || "0"));
    
    if (jobCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete customer. They have ${jobCount} associated job${jobCount > 1 ? 's' : ''}.` 
      });
    }

    // Safe to delete - no associated jobs
    await db.execute(sql`
      delete from customers
      where id=${id}::uuid and org_id = ${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete customer" });
  }
});

/* CSV IMPORT */
customers.post("/import-csv", requireAuth, requireOrg, upload.single('csvFile'), async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] POST /api/customers/import-csv org=%s", orgId);
  if (!req.file) {
    return res.status(400).json({ error: "No CSV file uploaded" });
  }

  try {
    // Double-check org existence
    const ok: any = await db.execute(sql`select 1 from orgs where id=${orgId}::uuid`);
    if (!ok || ok.length === 0) {
      console.log(`[AUTH] 400 - Invalid org at CSV import: orgId=${orgId}`);
      return res.status(400).json({ error: "Invalid org" });
    }

    // Handle different encodings and remove BOM
    let csvContent = req.file.buffer.toString('utf-8');
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1); // Remove BOM
    }
    
    
    const records: any[] = [];
    
    // Parse CSV with flexible separators
    const readable = Readable.from([csvContent]);
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [',', ';', '\t'], // Try multiple separators
      relax_quotes: true,
      escape: '"'
    });

    readable.pipe(parser);

    for await (const record of parser) {
      records.push(record);
    }


    if (records.length === 0) {
      return res.status(400).json({ error: "No valid records found in CSV" });
    }

    let imported = 0;
    let errors: string[] = [];

    // Process each record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNum = i + 2; // +2 because CSV header is row 1, data starts at row 2
      
      try {
        const { name, email, phone, address, contact_name, street, suburb, state, postcode, notes } = record;
        
        
        if (!name?.trim()) {
          errors.push(`Row ${rowNum}: Missing required field 'name'`);
          continue;
        }

        // Insert customer
        await db.execute(sql`
          insert into customers (
            org_id, name, contact_name, email, phone, address, street, suburb, state, postcode, notes
          ) values (
            ${orgId}::uuid, ${name}, ${contact_name||null}, ${email||null}, ${phone||null}, ${address||null}, ${street||null}, ${suburb||null}, ${state||null}, ${postcode||null}, ${notes||null}
          )
        `);

        imported++;
      } catch (error: any) {
        errors.push(`Row ${rowNum}: ${error.message}`);
      }
    }

    // Track TikTok Lead event for successful CSV import (fire and forget - non-blocking)
    if (imported > 0) {
      try {
        const customerInfo: CustomerInfo = {
          ip: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.get('User-Agent') || undefined,
          country: 'AU', // Default to Australia for Taska
        };

        const leadData = {
          value: imported * 500, // Estimated customer lifetime value per imported customer
          currency: 'AUD',
          contentName: 'Bulk Customer Import Lead',
          contentCategory: 'lead_generation',
          contentType: 'lead_generation',
          description: `CSV import completed: ${imported} customers imported from ${records.length} records`,
          status: 'qualified',
        };

        // Fire and forget - don't wait for response to avoid slowing down import response
        tiktokEvents.trackLead(
          customerInfo,
          leadData,
          req.get('Referer') || undefined,
          req.get('Referer') || undefined
        ).catch((trackingError) => {
          // Log tracking errors but don't throw them
          console.error('[CSV_IMPORT] TikTok Lead tracking failed:', trackingError);
        });

        console.log(`[CSV_IMPORT] TikTok Lead tracking initiated for bulk import: ${imported} customers (Total value: $${imported * 500})`);
      } catch (trackingError) {
        // Log any tracking errors but don't let them break CSV import
        console.error('[CSV_IMPORT] TikTok tracking error:', trackingError);
      }
    }

    res.json({
      ok: true,
      imported,
      total: records.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("POST /api/customers/import-csv error:", error);
    res.status(500).json({ error: error?.message || "Failed to import CSV" });
  }
});

export { customers as default };
