import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import cors from "cors";
import { health } from "./routes/health";
import customers from "./routes/customers";
import equipment from "./routes/equipment";
import { teams } from "./routes/teams";
import jobs from "./routes/jobs";
import quotes from "./routes/quotes";
import invoices from "./routes/invoices";
import { schedule } from "./routes/schedule";
import { members } from "./routes/members";
import { jobSms } from "./routes/job-sms";
import { twilioWebhooks } from "./routes/twilio-webhooks";
import { itemPresets } from "./routes/item-presets";
import tzRouter from "./routes/_tz";
import objectsRouter from "./routes/objects";
import subscriptions from "./routes/subscriptions";
import usage from "./routes/usage";
import { debug } from "./routes/debug";
import { aiSupportRouter } from "./routes/ai-support";
import supportTickets from "./routes/support-tickets";
import { publicRouter } from "./routes/public";
import adminRoutes from "./routes/admin";
import mediaRouter from "./routes/media";
import { blockSupportStaffFromCustomerData } from "./middleware/access-control";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  
  app.use("/health", health);
  
  // Public routes - no authentication required
  app.use("/api/public", publicRouter);
  
  // Customer data routes - block support staff from accessing these
  app.use("/api/customers", blockSupportStaffFromCustomerData, customers);
  app.use("/api/equipment", blockSupportStaffFromCustomerData, equipment);
  app.use("/api/teams", blockSupportStaffFromCustomerData, teams);
  app.use("/api/jobs", blockSupportStaffFromCustomerData, jobs);
  app.use("/api/jobs", blockSupportStaffFromCustomerData, jobSms);
  app.use("/api/twilio", twilioWebhooks);
  app.use("/api/schedule", blockSupportStaffFromCustomerData, schedule);
  
  app.use("/api/members", blockSupportStaffFromCustomerData, members);
  
  app.use("/api/quotes", blockSupportStaffFromCustomerData, quotes);
 
  app.use("/api/invoices", blockSupportStaffFromCustomerData, invoices);
  
  app.use("/api/item-presets", blockSupportStaffFromCustomerData, itemPresets);
  
  
  app.use("/api/_tz", tzRouter);

  app.use("/api/objects", objectsRouter);
  
  app.use("/api/media", blockSupportStaffFromCustomerData, mediaRouter);
  
  app.use("/api/subscriptions", subscriptions);
 
  app.use("/api/usage", usage);
  
  app.use("/api/debug", debug);
  
  app.use("/api/ai-support", aiSupportRouter);
  
  app.use("/api/support-tickets", supportTickets);
  
  
  // Admin routes - requires admin authentication
  app.use("/api/admin", adminRoutes);
  
  
  // Migration export tool
  app.get("/migration-export.html", (_req, res) => {
    res.sendFile("migration-export.html", { root: process.cwd() });
  });
  
  // Data export tool
  app.get("/export-local-data.html", (_req, res) => {
    res.sendFile("export-local-data.html", { root: process.cwd() });
  });
  
  app.get("/api", (_req, res) => res.json({ ok: true, name: "Taska 2.0 API" }));

  const httpServer = createServer(app);
  return httpServer;
}
