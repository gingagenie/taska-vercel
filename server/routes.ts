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
import xero from "./routes/xero";
import { itemPresets } from "./routes/item-presets";
import tzRouter from "./routes/_tz";
import objectsRouter from "./routes/objects";
import subscriptions from "./routes/subscriptions";
import usage from "./routes/usage";
import { debug } from "./routes/debug";
import { aiSupportRouter } from "./routes/ai-support";
import supportTickets from "./routes/support-tickets";
import { blockSupportStaffFromCustomerData } from "./middleware/access-control";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  
  app.use("/health", health);
  
  // Customer data routes - block support staff from accessing these
  app.use("/api/customers", blockSupportStaffFromCustomerData, customers);
  console.log("[mount] /api/customers (customer-only)");
  app.use("/api/equipment", blockSupportStaffFromCustomerData, equipment);
  console.log("[mount] /api/equipment (customer-only)");
  app.use("/api/teams", blockSupportStaffFromCustomerData, teams);
  app.use("/api/jobs", blockSupportStaffFromCustomerData, jobs);
  app.use("/api/jobs", blockSupportStaffFromCustomerData, jobSms);
  app.use("/api/twilio", twilioWebhooks);
  console.log("[mount] /api/twilio");
  console.log("[mount] /api/jobs (customer-only)");
  app.use("/api/schedule", blockSupportStaffFromCustomerData, schedule);
  console.log("[mount] /api/schedule (customer-only)");
  app.use("/api/members", blockSupportStaffFromCustomerData, members);
  console.log("[mount] /api/members (customer-only)");
  app.use("/api/quotes", blockSupportStaffFromCustomerData, quotes);
  console.log("[mount] /api/quotes (customer-only)");
  app.use("/api/invoices", blockSupportStaffFromCustomerData, invoices);
  console.log("[mount] /api/invoices (customer-only)");
  app.use("/api/xero", blockSupportStaffFromCustomerData, xero);
  app.use("/api/item-presets", blockSupportStaffFromCustomerData, itemPresets);
  console.log("[mount] /api/xero (customer-only)");
  console.log("[mount] /api/item-presets (customer-only)");
  
  app.use("/api/_tz", tzRouter);
  console.log("[mount] /api/_tz");
  app.use("/api/objects", objectsRouter);
  console.log("[mount] /api/objects");
  app.use("/api/subscriptions", subscriptions);
  console.log("[mount] /api/subscriptions");
  app.use("/api/usage", usage);
  console.log("[mount] /api/usage");
  app.use("/api/debug", debug);
  console.log("[mount] /api/debug");
  app.use("/api/ai-support", aiSupportRouter);
  console.log("[mount] /api/ai-support");
  app.use("/api/support-tickets", supportTickets);
  console.log("[mount] /api/support-tickets");
  
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
