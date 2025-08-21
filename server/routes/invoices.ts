import { Router } from "express";
export const invoices = Router();
invoices.get("/", (_req, res) => res.status(501).json({ error: "Not implemented" }));
invoices.post("/", (_req, res) => res.status(501).json({ error: "Not implemented" }));