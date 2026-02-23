
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import jobsRouter from "./jobs";
import bcrypt from "bcryptjs";

const portalRouter = Router();

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

function getPortalCustomerId(req: any): string | null {
  return (
    req?.session?.customerId ||
    req?.session?.customer?.id ||
    null
  );
}

async function getOrgIdBySlug(orgSlug: string): Promise<string | null> {
  const r: any = await db.execute(sql`
    SELECT id
    FROM orgs
    WHERE lower(slug) = lower(${orgSlug})
    LIMIT 1
  `);
  return r?.[0]?.id || null;
}

// Add this to server/routes/portal.ts after the helper functions and before the equipment endpoints
/* --------------------------------------------------
   LOGIN
-------------------------------------------------- */

portalRouter.post("/portal/:org/login", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    const orgSlug = req.params.org;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Find customer user by email and org
    const users: any = await db.execute(sql`
      SELECT id, customer_id, email, password_hash, disabled_at
      FROM customer_users
      WHERE email = ${email}
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!users.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    // Check if account is disabled
    if (user.disabled_at) {
      return res.status(401).json({ error: "Account disabled" });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Set session
    req.session.customerId = user.customer_id;
    req.session.customerUserEmail = user.email;

    // Save session and return success
    req.session.save((err: any) => {
      if (err) {
        console.error("[portal login] Session save error:", err);
        return res.status(500).json({ error: "Login failed" });
      }
      res.json({ success: true, customerId: user.customer_id });
    });

  } catch (e: any) {
    console.error("[portal login]", e);
    res.status(500).json({ error: "Login failed" });
  }
});

/* --------------------------------------------------
   LOGOUT
-------------------------------------------------- */

portalRouter.post("/portal/:org/logout", async (req: any, res) => {
  req.session.destroy((err: any) => {
    if (err) {
      console.error("[portal logout]", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

/* --------------------------------------------------
   ME - Get current portal user info
-------------------------------------------------- */

portalRouter.get("/portal/:org/me", async (req: any, res) => {
  try {
    const orgSlug = req.params.org;
    const customerId = getPortalCustomerId(req);
    
    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Get customer details
    const customerRows: any = await db.execute(sql`
      SELECT id, name, email, phone
      FROM customers
      WHERE id = ${customerId}::uuid AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!customerRows || customerRows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerRows[0];

    res.json({
      customer_id: customer.id,
      customer_name: customer.name,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      org_id: orgId,
    });
  } catch (error: any) {
    console.error("Error fetching portal customer info:", error);
    res.status(500).json({ error: "Failed to fetch customer info" });
  }
});

/* --------------------------------------------------
   Debug
-------------------------------------------------- */

portalRouter.get("/portal/:org/debug-session", async (req: any, res) => {
  const orgSlug = req.params.org;
  const orgId = await getOrgIdBySlug(orgSlug);

  res.json({
    orgSlug,
    orgId,
    session: {
      customerId: req?.session?.customerId || null,
      customer: req?.session?.customer || null,
    },
    cookie: req.headers?.cookie || null,
  });
});

/* --------------------------------------------------
   Equipment
-------------------------------------------------- */

portalRouter.get("/portal/:org/equipment", async (req: any, res) => {
  try {
    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number, last_service_date, next_service_date
      FROM equipment
      WHERE org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    res.json(r);
  } catch (e: any) {
    console.error("[portal equipment]", e);
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

portalRouter.get("/portal/:org/equipment/:id", async (req: any, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid equipment id" });

  try {
    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const eq: any = await db.execute(sql`
      SELECT *
      FROM equipment
      WHERE id = ${id}::uuid
        AND org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      LIMIT 1
    `);

    if (!eq.length) return res.status(404).json({ error: "Equipment not found" });

    const jobs: any = await db.execute(sql`
      SELECT DISTINCT cj.id, cj.title, cj.completed_at
      FROM completed_jobs cj
      INNER JOIN completed_job_equipment cje ON cje.completed_job_id = cj.id
      WHERE cj.org_id = ${orgId}::uuid
       AND cj.customer_id = ${customerId}::uuid
       AND cje.equipment_id = ${id}::uuid
     ORDER BY cj.completed_at DESC
   `);
     
    res.json({ equipment: eq[0], jobs });
  } catch (e: any) {
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

/* --------------------------------------------------
   SERVICE SHEET (proxy to jobs.ts)
-------------------------------------------------- */

portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT customer_id
      FROM completed_jobs
      WHERE id = ${completedJobId}::uuid
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!r.length) return res.status(404).json({ error: "Completed job not found" });
    if (String(r[0].customer_id) !== String(customerId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.isPortal = true;
    req.customerId = customerId;
    req.orgId = orgId;

    req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;
    return (jobsRouter as any)(req, res, next);
  }
);

/* --------------------------------------------------
   ✅ CONVERT TO INVOICE (THE FIX)
-------------------------------------------------- */

portalRouter.post(
  "/portal/:org/jobs/completed/:completedJobId/convert-to-invoice",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT customer_id
      FROM completed_jobs
      WHERE id = ${completedJobId}::uuid
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!r.length) return res.status(404).json({ error: "Completed job not found" });
    if (String(r[0].customer_id) !== String(customerId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.isPortal = true;
    req.customerId = customerId;
    req.orgId = orgId;

    // 🔁 forward into jobs.ts
    req.url = `/completed/${completedJobId}/convert-to-invoice`;
    return (jobsRouter as any)(req, res, next);
  }
);

export default portalRouter;
