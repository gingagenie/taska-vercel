import { Router } from "express";
export const quotes = Router();
quotes.get("/", (_req, res) => res.status(501).json({ error: "Not implemented" }));
quotes.post("/", (_req, res) => res.status(501).json({ error: "Not implemented" }));