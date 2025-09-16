import { Router } from "express";
import { db } from "../db/client";
import { jobs } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const publicRouter = Router();

// Job confirmation endpoint - no auth required
publicRouter.get("/jobs/confirm", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Confirmation token required" });
    }
    
    console.log(`[PUBLIC] Confirming job with token: ${token}`);
    
    // Set service context to bypass RLS
    await db.execute(sql`select set_config('app.service', 'true', true)`);
    
    // Find and update the job
    const result = await db
      .update(jobs)
      .set({ 
        status: "confirmed",
        updatedAt: new Date()
      })
      .where(eq(jobs.confirmationToken, token))
      .returning({ id: jobs.id, title: jobs.title });
    
    if (result.length === 0) {
      console.log(`[PUBLIC] No job found with token: ${token}`);
      return res.status(404).json({ error: "Invalid or expired confirmation token" });
    }
    
    const job = result[0];
    console.log(`[PUBLIC] Job confirmed: ${job.id} - ${job.title}`);
    
    // Return simple success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job Confirmed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; border-radius: 10px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin: 10px 0; }
          .job-title { font-weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <h1>Job Confirmed!</h1>
          <p class="job-title">"${job.title}"</p>
          <p>Thank you for confirming your appointment.</p>
          <p style="margin-top: 30px; font-size: 14px; color: #888;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error("[PUBLIC] Confirmation error:", error);
    res.status(500).json({ error: "Failed to confirm job" });
  }
});