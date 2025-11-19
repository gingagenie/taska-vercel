import express from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { requireAuth } from "../middleware/require-auth";
import { sendQuoteEmailToCustomer } from "../services/email";
import { db } from "../db/client";
import * as schema from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const router = express.Router();

/* ---------------------------------------------------------
   GET all quotes for org
--------------------------------------------------------- */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.org_id;

    const quotes = await db
      .select()
      .from(schema.quotes)
      .where(eq(schema.quotes.org_id, orgId))
      .orderBy(schema.quotes.created_at);

    res.json({ ok: true, quotes });
  } catch (error) {
    console.error("GET /api/quotes failed:", error);
    res.status(500).json({ ok: false, error: "Failed to load quotes" });
  }
});

/* ---------------------------------------------------------
   GET single quote
--------------------------------------------------------- */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.org_id;
    const id = req.params.id;

    const quote = await db
      .select()
      .from(schema.quotes)
      .where(and(eq(schema.quotes.id, id), eq(schema.quotes.org_id, orgId)));

    if (!quote[0]) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    res.json({ ok: true, quote: quote[0] });
  } catch (error) {
    console.error("GET /api/quotes/:id failed:", error);
    res.status(500).json({ ok: false, error: "Failed to load quote" });
  }
});

/* ---------------------------------------------------------
   CREATE quote
--------------------------------------------------------- */
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.org_id;
    const userId = req.user!.id;

    const quoteInput = z.object({
      title: z.string(),
      customer_id: z.string(),
      items: z.array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unit_price: z.number(),
        })
      ),
      notes: z.string().optional(),
      subtotal: z.number(),
      gst: z.number(),
      total: z.number(),
    });

    const body = quoteInput.parse(req.body);

    const [quote] = await db
      .insert(schema.quotes)
      .values({
        ...body,
        org_id: orgId,
        created_by: userId,
      })
      .returning();

    res.json({ ok: true, quote });
  } catch (error: any) {
    console.error("POST /api/quotes failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to save quote" });
  }
});

/* ---------------------------------------------------------
   UPDATE quote
--------------------------------------------------------- */
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.org_id;
    const id = req.params.id;

    const quoteInput = z.object({
      title: z.string(),
      customer_id: z.string(),
      items: z.array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unit_price: z.number(),
        })
      ),
      notes: z.string().optional(),
      subtotal: z.number(),
      gst: z.number(),
      total: z.number(),
    });

    const body = quoteInput.parse(req.body);

    const [quote] = await db
      .update(schema.quotes)
      .set(body)
      .where(and(eq(schema.quotes.id, id), eq(schema.quotes.org_id, orgId)))
      .returning();

    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    res.json({ ok: true, quote });
  } catch (error: any) {
    console.error("PUT /api/quotes/:id failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to update quote" });
  }
});

/* ---------------------------------------------------------
   SEND quote email (no PDF)
--------------------------------------------------------- */
router.post("/:id/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const orgId = req.user!.org_id;

    const quote = await db
      .select()
      .from(schema.quotes)
      .where(and(eq(schema.quotes.id, id), eq(schema.quotes.org_id, orgId)));

    if (!quote[0]) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const customer = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, quote[0].customer_id));

    if (!customer[0]) {
      return res.status(400).json({ ok: false, error: "Customer not found" });
    }

    // Send ONLY email — no PDF
    await sendQuoteEmailToCustomer(quote[0], customer[0]);

    res.json({ ok: true });
  } catch (error) {
    console.error("POST /api/quotes/:id/send failed:", error);
    res.status(500).json({ ok: false, error: "Failed to send quote" });
  }
});

/* ---------------------------------------------------------
   PUBLIC: Accept a quote
--------------------------------------------------------- */
router.get("/:id/accept", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    await db
      .update(schema.quotes)
      .set({ status: "accepted" })
      .where(eq(schema.quotes.id, id));

    res.send(`
      <html><body>
        <h1>Quote Accepted</h1>
        <p>Thank you! We'll be in touch shortly.</p>
      </body></html>
    `);
  } catch (error) {
    console.error("Quote accept error:", error);
    res.status(500).send("Failed to accept quote");
  }
});

/* ---------------------------------------------------------
   PUBLIC: Decline a quote
--------------------------------------------------------- */
router.get("/:id/decline", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    await db
      .update(schema.quotes)
      .set({ status: "declined" })
      .where(eq(schema.quotes.id, id));

    res.send(`
      <html><body>
        <h1>Quote Declined</h1>
        <p>No worries — thanks for letting us know.</p>
      </body></html>
    `);
  } catch (error) {
    console.error("Quote decline error:", error);
    res.status(500).send("Failed to decline quote");
  }
});

export default router;
