import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import cors from "cors";
import { health } from "./routes/health";
import { customers } from "./routes/customers";
import { equipment } from "./routes/equipment";
import { teams } from "./routes/teams";
import { jobs } from "./routes/jobs";
import { quotes } from "./routes/quotes";
import { invoices } from "./routes/invoices";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  
  app.use("/health", health);
  app.use("/api/customers", customers);
  app.use("/api/equipment", equipment);
  app.use("/api/teams", teams);
  app.use("/api/jobs", jobs);
  app.use("/api/quotes", quotes);
  app.use("/api/invoices", invoices);
  
  app.get("/api", (_req, res) => res.json({ ok: true, name: "Taska 2.0 API" }));

  const httpServer = createServer(app);
  return httpServer;
}
