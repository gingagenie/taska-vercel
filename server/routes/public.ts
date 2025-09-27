import { Router } from "express";
import { db } from "../db/client";
import { jobs, blogPosts, quotes, newsletterSubscribers, insertNewsletterSubscriberSchema } from "../../shared/schema";
import { eq, desc, and, ilike, isNotNull } from "drizzle-orm";
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

// Blog endpoints - no auth required for published posts
publicRouter.get("/blog", async (req, res) => {
  try {
    const { search, category, tag, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 10, 50); // Max 50 posts per page
    const offset = (pageNum - 1) * limitNum;
    
    console.log(`[PUBLIC] Fetching blog posts - page: ${pageNum}, limit: ${limitNum}`);
    
    let whereConditions = [
      eq(blogPosts.status, "published"),
      isNotNull(blogPosts.publishedAt)
    ];
    
    // Add search filter
    if (search && typeof search === "string") {
      whereConditions.push(
        sql`(${blogPosts.title} ILIKE ${`%${search}%`} OR ${blogPosts.excerpt} ILIKE ${`%${search}%`})`
      );
    }
    
    // Add category filter
    if (category && typeof category === "string") {
      whereConditions.push(eq(blogPosts.category, category));
    }
    
    // Add tag filter
    if (tag && typeof tag === "string") {
      whereConditions.push(sql`${tag} = ANY(${blogPosts.tags})`);
    }
    
    const posts = await db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        authorName: blogPosts.authorName,
        category: blogPosts.category,
        tags: blogPosts.tags,
        coverImageUrl: blogPosts.coverImageUrl,
        publishedAt: blogPosts.publishedAt,
        updatedAt: blogPosts.updatedAt
      })
      .from(blogPosts)
      .where(and(...whereConditions))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limitNum)
      .offset(offset);
    
    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(blogPosts)
      .where(and(...whereConditions));
      
    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      posts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error("[PUBLIC] Blog list error:", error);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

// Get individual blog post by slug
publicRouter.get("/blog/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({ error: "Slug is required" });
    }
    
    console.log(`[PUBLIC] Fetching blog post: ${slug}`);
    
    const post = await db
      .select()
      .from(blogPosts)
      .where(and(
        eq(blogPosts.slug, slug),
        eq(blogPosts.status, "published"),
        isNotNull(blogPosts.publishedAt)
      ))
      .limit(1);
    
    if (post.length === 0) {
      console.log(`[PUBLIC] Blog post not found: ${slug}`);
      return res.status(404).json({ error: "Blog post not found" });
    }
    
    res.json(post[0]);
    
  } catch (error) {
    console.error("[PUBLIC] Blog post error:", error);
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
});

// Quote acceptance endpoint - no auth required
publicRouter.get("/quotes/accept", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Confirmation token required" });
    }
    
    console.log(`[PUBLIC] Accepting quote with token: ${token}`);
    
    // Set service context to bypass RLS
    await db.execute(sql`select set_config('app.service', 'true', true)`);
    
    // Find and update the quote
    const result = await db
      .update(quotes)
      .set({ 
        status: "accepted"
      })
      .where(eq(quotes.confirmationToken, token))
      .returning({ 
        id: quotes.id, 
        title: quotes.title, 
        grandTotal: quotes.grandTotal,
        customerId: quotes.customerId 
      });
    
    if (result.length === 0) {
      console.log(`[PUBLIC] No quote found with token: ${token}`);
      return res.status(404).json({ error: "Invalid or expired confirmation token" });
    }
    
    const quote = result[0];
    console.log(`[PUBLIC] Quote accepted: ${quote.id} - ${quote.title}`);
    
    // Return simple success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quote Accepted</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; border-radius: 10px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin: 10px 0; }
          .quote-title { font-weight: bold; color: #333; }
          .quote-total { font-size: 18px; font-weight: bold; color: #2563eb; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <h1>Quote Accepted!</h1>
          <p class="quote-title">"${quote.title}"</p>
          <p class="quote-total">Total: $${Number(quote.grandTotal || 0).toFixed(2)}</p>
          <p>Thank you for accepting our quote.</p>
          <p>We will be in touch shortly to schedule the work.</p>
          <p style="margin-top: 30px; font-size: 14px; color: #888;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error("[PUBLIC] Quote acceptance error:", error);
    res.status(500).json({ error: "Failed to accept quote" });
  }
});

// Quote decline endpoint - no auth required
publicRouter.get("/quotes/decline", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Confirmation token required" });
    }
    
    console.log(`[PUBLIC] Declining quote with token: ${token}`);
    
    // Set service context to bypass RLS
    await db.execute(sql`select set_config('app.service', 'true', true)`);
    
    // Find and update the quote
    const result = await db
      .update(quotes)
      .set({ 
        status: "rejected"
      })
      .where(eq(quotes.confirmationToken, token))
      .returning({ 
        id: quotes.id, 
        title: quotes.title,
        customerId: quotes.customerId 
      });
    
    if (result.length === 0) {
      console.log(`[PUBLIC] No quote found with token: ${token}`);
      return res.status(404).json({ error: "Invalid or expired confirmation token" });
    }
    
    const quote = result[0];
    console.log(`[PUBLIC] Quote declined: ${quote.id} - ${quote.title}`);
    
    // Return simple decline page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quote Declined</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; border-radius: 10px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .declined { color: #ef4444; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin: 10px 0; }
          .quote-title { font-weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="declined">❌</div>
          <h1>Quote Declined</h1>
          <p class="quote-title">"${quote.title}"</p>
          <p>Thank you for your response.</p>
          <p>We understand this quote wasn't suitable at this time.</p>
          <p>Please feel free to contact us if you have any questions or would like to discuss alternatives.</p>
          <p style="margin-top: 30px; font-size: 14px; color: #888;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error("[PUBLIC] Quote decline error:", error);
    res.status(500).json({ error: "Failed to decline quote" });
  }
});

// Newsletter subscription endpoint - no auth required
publicRouter.post("/newsletter/subscribe", async (req, res) => {
  try {
    const { email, source = "blog" } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    
    const emailLower = email.toLowerCase().trim();
    console.log(`[PUBLIC] Newsletter subscription request: ${emailLower} from ${source}`);
    
    // Check if email already exists (case-insensitive) - using SQL for now to avoid ORM issues
    const existingSubscriber = await db.execute(sql`
      SELECT * FROM newsletter_subscribers 
      WHERE email_lower = ${emailLower} 
      LIMIT 1
    `);
    
    if (existingSubscriber.length > 0) {
      const subscriber = existingSubscriber[0];
      
      // If already active, just return success (idempotent)
      if (subscriber.status === "active") {
        console.log(`[PUBLIC] Email already subscribed: ${emailLower}`);
        return res.json({ 
          message: "Successfully subscribed!", 
          status: "already_subscribed" 
        });
      }
      
      // If unsubscribed, reactivate the subscription with new unsubscribe token
      if (subscriber.status === "unsubscribed") {
        const newUnsubscribeToken = `unsub_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        await db.execute(sql`
          UPDATE newsletter_subscribers 
          SET status = 'active', 
              unsubscribed_at = NULL, 
              unsubscribe_token = ${newUnsubscribeToken}, 
              updated_at = NOW()
          WHERE id = ${subscriber.id}
        `);
        
        console.log(`[PUBLIC] Newsletter subscription reactivated: ${emailLower}`);
        return res.json({ 
          message: "Successfully resubscribed!", 
          status: "resubscribed" 
        });
      }
    }
    
    // Create new subscription with secure unsubscribe token
    const unsubscribeToken = `unsub_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    const result = await db.execute(sql`
      INSERT INTO newsletter_subscribers (email, email_lower, source, status, unsubscribe_token, confirmed_at)
      VALUES (${email}, ${emailLower}, ${source}, 'active', ${unsubscribeToken}, NOW())
      RETURNING id, email
    `);
    
    const newSubscriber = result[0];
    console.log(`[PUBLIC] Newsletter subscription created: ${newSubscriber.id} - ${emailLower}`);
    
    res.json({ 
      message: "Successfully subscribed to our newsletter!", 
      status: "subscribed",
      subscriber: newSubscriber
    });
    
  } catch (error) {
    console.error("[PUBLIC] Newsletter subscription error:", error);
    res.status(500).json({ error: "Failed to subscribe to newsletter" });
  }
});

// Newsletter unsubscribe endpoint - no auth required
publicRouter.get("/newsletter/unsubscribe", async (req, res) => {
  try {
    const { email, token } = req.query;
    
    if (!email && !token) {
      return res.status(400).json({ error: "Email or unsubscribe token required" });
    }
    
    console.log(`[PUBLIC] Newsletter unsubscribe request: ${email || token}`);
    
    let whereCondition;
    if (token && typeof token === "string") {
      // Use unsubscribe token if provided (secure method for email links)
      whereCondition = eq(newsletterSubscribers.unsubscribeToken, token);
    } else if (email && typeof email === "string") {
      // Use lowercased email if provided (for direct unsubscribe)
      const emailLower = email.toLowerCase().trim();
      whereCondition = eq(newsletterSubscribers.emailLower, emailLower);
    } else {
      return res.status(400).json({ error: "Valid email or unsubscribe token required" });
    }
    
    // Find and update the subscriber
    const result = await db
      .update(newsletterSubscribers)
      .set({ 
        status: "unsubscribed",
        unsubscribedAt: new Date(),
        updatedAt: new Date()
      })
      .where(whereCondition)
      .returning({ 
        id: newsletterSubscribers.id, 
        email: newsletterSubscribers.email 
      });
    
    if (result.length === 0) {
      console.log(`[PUBLIC] No subscriber found for unsubscribe: ${email || token}`);
      return res.status(404).json({ error: "Subscription not found" });
    }
    
    const subscriber = result[0];
    console.log(`[PUBLIC] Newsletter unsubscribed: ${subscriber.id} - ${subscriber.email}`);
    
    // Return simple unsubscribe confirmation page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; border-radius: 10px; padding: 40px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin: 10px 0; }
          .email { font-weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓</div>
          <h1>Successfully Unsubscribed</h1>
          <p class="email">${subscriber.email}</p>
          <p>You have been unsubscribed from our newsletter.</p>
          <p>We're sorry to see you go! If you change your mind, you can always subscribe again from our blog.</p>
          <p style="margin-top: 30px; font-size: 14px; color: #888;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error("[PUBLIC] Newsletter unsubscribe error:", error);
    res.status(500).json({ error: "Failed to unsubscribe from newsletter" });
  }
});