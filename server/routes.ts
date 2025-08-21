import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from "express";
import { db } from "./db";
import { 
  customers, 
  jobs, 
  equipment, 
  teams, 
  quotes, 
  invoices, 
  organizations, 
  entitlements,
  insertCustomerSchema,
  insertJobSchema,
  insertEquipmentSchema
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// Helper function for auth middleware
function requireAuth(req: any, res: any, next: any) {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  req.user = { id: userId };
  next();
}

function requireOrg(req: any, res: any, next: any) {
  const orgId = req.headers["x-org-id"] as string;
  if (!orgId) return res.status(400).json({ error: "No organization in session" });
  req.orgId = orgId;
  next();
}

// Create routers for each resource
const healthRouter = Router();
const customersRouter = Router();
const jobsRouter = Router();
const equipmentRouter = Router();
const teamsRouter = Router();
const quotesRouter = Router();
const invoicesRouter = Router();

// Health endpoints
healthRouter.get("/", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Customer endpoints
customersRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select().from(customers).where(eq(customers.orgId, req.orgId));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

customersRouter.post("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const validatedData = insertCustomerSchema.parse({ ...req.body, orgId: req.orgId });
    const result = await db.insert(customers).values(validatedData).returning();
    res.json({ ok: true, id: result[0].id });
  } catch (error) {
    res.status(400).json({ error: "Failed to create customer" });
  }
});

// Job endpoints
jobsRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select().from(jobs).where(eq(jobs.orgId, req.orgId)).orderBy(desc(jobs.createdAt));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

jobsRouter.get("/customers", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.orgId, req.orgId));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

jobsRouter.get("/equipment", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select({ id: equipment.id, name: equipment.name }).from(equipment).where(eq(equipment.orgId, req.orgId));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch equipment" });
  }
});

jobsRouter.post("/create", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const validatedData = insertJobSchema.parse({ 
      ...req.body, 
      orgId: req.orgId,
      createdBy: req.user.id 
    });
    const result = await db.insert(jobs).values(validatedData).returning();
    res.json({ ok: true, id: result[0].id });
  } catch (error) {
    res.status(400).json({ error: "Failed to create job" });
  }
});

// Equipment endpoints
equipmentRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select().from(equipment).where(eq(equipment.orgId, req.orgId));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch equipment" });
  }
});

equipmentRouter.post("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const validatedData = insertEquipmentSchema.parse({ ...req.body, orgId: req.orgId });
    const result = await db.insert(equipment).values(validatedData).returning();
    res.json({ ok: true, id: result[0].id });
  } catch (error) {
    res.status(400).json({ error: "Failed to create equipment" });
  }
});

// Teams endpoints
teamsRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    const result = await db.select().from(teams).where(eq(teams.orgId, req.orgId));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// Quotes endpoints (Pro feature)
quotesRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    // Check if org has pro entitlement
    const entitlement = await db.select().from(entitlements).where(eq(entitlements.orgId, req.orgId)).limit(1);
    if (!entitlement.length || !entitlement[0].active) {
      return res.status(402).json({ error: "Upgrade required" });
    }
    
    const result = await db.select().from(quotes).where(eq(quotes.orgId, req.orgId)).orderBy(desc(quotes.createdAt));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

// Invoices endpoints (Pro feature)
invoicesRouter.get("/", requireAuth, requireOrg, async (req: any, res) => {
  try {
    // Check if org has pro entitlement
    const entitlement = await db.select().from(entitlements).where(eq(entitlements.orgId, req.orgId)).limit(1);
    if (!entitlement.length || !entitlement[0].active) {
      return res.status(402).json({ error: "Upgrade required" });
    }
    
    const result = await db.select().from(invoices).where(eq(invoices.orgId, req.orgId)).orderBy(desc(invoices.createdAt));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Mount all API routes with /api prefix
  app.use("/api/health", healthRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/equipment", equipmentRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/invoices", invoicesRouter);

  // Root API endpoint
  app.get("/api", (_req, res) => res.json({ ok: true, name: "ServicePro API" }));

  const httpServer = createServer(app);
  return httpServer;
}
