import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { tiktokEvents } from "../services/tiktok-events";
import type { CustomerInfo } from "../services/tiktok-events";
import { generateAuthTokens, refreshAuthTokens, isJwtAuthDisabled } from "../lib/jwt-auth-tokens";
import Stripe from "stripe";
import { subscriptionPlans } from "../../shared/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe((process.env.STRIPE_SECRET_KEY || "").trim(), {
  apiVersion: "2023-10-16", // stable api version
});

declare module "express-session" {
  interface SessionData {
    userId?: string;
    orgId?: string;
  }
}

const router = Router();

/* ------------------------------- Multer ---------------------------------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = (req.session as any).userId;
    const ext = path.extname(file.originalname);
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/* --------------------------- Basic email signup -------------------------- */

router.post("/register", async (req, res) => {
  const { orgName, name, email, password } = req.body || {};
  if (!orgName || !email || !password) {
    return res.status(400).json({ error: "orgName, email, password required" });
  }

  try {
    // Create org
    const orgIns: any = await db.execute(sql`insert into orgs (name) values (${orgName}) returning id`);
    const orgId = orgIns[0].id;

    // Create user with password hash
    const hash = await bcrypt.hash(password, 10);
    const userIns: any = await db.execute(sql`
      insert into users (org_id, name, email, password_hash, role)
      values (${orgId}, ${name || "Owner"}, ${email}, ${hash}, 'admin')
      returning id, name, email, role
    `);
    const user = userIns[0];

    // Seed a 14-day trial locally (legacy path)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    await db.execute(sql`
      insert into org_subscriptions (org_id, plan_id, status, trial_end, current_period_end)
      values (${orgId}, 'pro', 'trial', ${trialEndDate.toISOString()}, ${trialEndDate.toISOString()})
    `);

    // TikTok fire-and-forget
    try {
      const customerInfo: CustomerInfo = {
        email,
        firstName: name?.split(" ")[0] || undefined,
        lastName: name?.split(" ").slice(1).join(" ") || undefined,
        ip: req.ip || (req.connection as any).remoteAddress || "",
        userAgent: req.get("User-Agent") || "",
        country: "AU",
      };
      tiktokEvents
        .trackCompleteRegistration(customerInfo, { value: 100, currency: "AUD", status: "completed", contentName: "User Registration - New Account Created" }, req.get("Referer") || undefined, req.get("Referer") || undefined)
        .catch((e) => console.error("[REGISTRATION] TikTok tracking failed:", e));
    } catch (e) {
      console.error("[REGISTRATION] TikTok tracking error:", e);
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "session error" });
      req.session.userId = user.id;
      req.session.orgId = orgId;
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: "session save error" });
        res.json({ ok: true, orgId, user });
      });
    });
  } catch (error: any) {
    console.error("Register error:", error);
    if (error.message?.includes("duplicate key")) {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Failed to create account" });
  }
});

/* ----------------- New: trial with card (create user first) -------------- */
/* This is the one you’ll use for live onboarding. */

router.post("/register-with-trial", async (req, res) => {
  const { orgName, name, email, password, planId } = req.body || {};

  if (!orgName || !email || !password || !planId) {
    return res.status(400).json({ error: "All fields required" });
  }
  if (!["solo", "pro", "enterprise"].includes(planId)) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    // Prevent duplicate users
    const existing: any = await db.execute(sql`
      select id from users where lower(email) = lower(${normalizedEmail}) limit 1
    `);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Pull plan + price (AUD)
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (!plan?.stripePriceId) {
      return res.status(500).json({ error: "Billing not configured for selected plan." });
    }

    // 1) Create org
    const orgIns: any = await db.execute(sql`insert into orgs (name) values (${orgName}) returning id, name`);
    const orgId = orgIns[0].id;
    const orgNameFinal = orgIns[0].name;

    // 2) Create user NOW with password hash (fixes the 401 issue)
    const passwordHash = await bcrypt.hash(password, 12);
    const userIns: any = await db.execute(sql`
      insert into users (org_id, name, email, password_hash, role)
      values (${orgId}, ${name || "Owner"}, ${normalizedEmail}, ${passwordHash}, 'admin')
      returning id, name, email, role
    `);
    const user = userIns[0];

    // 3) Create Stripe Customer tagged with org/user
    const customer = await stripe.customers.create({
      email: normalizedEmail,
      name: name || orgNameFinal,
      metadata: { orgId: String(orgId), userId: String(user.id) },
    });

    // 4) Create checkout session (14-day trial, card required)
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || `${req.protocol}://${req.get("host")}`;
    const trialDays = 14;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      payment_method_types: ["card"],
      payment_method_collection: "always",
      line_items: [{ price: plan.stripePriceId.trim(), quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { orgId: String(orgId), planId },
      },
      // Collect business/contact names and sync them
      customer_update: { name: "auto", address: "auto" },
      custom_fields: [
        {
          key: "business_name",
          label: { type: "custom", custom: "Business name" },
          type: "text",
          optional: true,
        },
        {
          key: "contact_name",
          label: { type: "custom", custom: "Contact name" },
          type: "text",
          optional: true,
        },
      ],
      success_url: `${baseUrl}/settings?tab=billing&success=true`,
      cancel_url: `${baseUrl}/auth/register?canceled=true`,
      locale: "en-GB",
      metadata: { orgId: String(orgId), planId },
    });

    // 5) (Optional) Seed a placeholder trial record; webhook will reconcile
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    await db.execute(sql`
      insert into org_subscriptions (org_id, plan_id, status, trial_end, current_period_end, stripe_customer_id)
      values (${orgId}, ${planId}, 'trial', ${trialEnd.toISOString()}, ${trialEnd.toISOString()}, ${customer.id})
      on conflict do nothing
    `);

    // 6) Return Checkout URL
    return res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    console.error("[TRIAL REG] Error:", error);
    return res.status(500).json({ error: "Failed to initiate registration" });
  }
});

/* --------- Legacy complete-registration (kept for back-compat) ----------- */
/* New flow no longer uses pending_registrations; safe to keep this route.  */

router.get("/complete-registration", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || typeof session_id !== "string") {
    return res.redirect("/auth/register?error=invalid_session");
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    if (checkoutSession.status !== "complete") {
      return res.redirect("/auth/register?error=payment_incomplete");
    }

    // Nothing else required for the new flow; user/org already exist.
    return res.redirect("/?welcome=true");
  } catch (error: any) {
    console.error("[TRIAL REG] Complete registration error:", error);
    return res.redirect("/auth/register?error=server_error");
  }
});

/* --------------------------------- Login --------------------------------- */

router.post("/login", async (req, res) => {
  const { email, password, orgId } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email & password required" });
  }

  try {
    const authMode = req.headers["x-auth-mode"] as string;
    const shouldUseTokenMode = authMode === "token";
    const jwtDisabled = isJwtAuthDisabled();

    const r: any = await db.execute(sql`
      select id, org_id, email, password_hash, name, role
      from users
      where lower(email) = lower(${email})
      ${orgId ? sql`and org_id = ${orgId}` : sql``}
      order by created_at asc
      limit 1
    `);
    const user = r[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await db.execute(sql`alter table users add column if not exists last_login_at timestamp`);
    await db.execute(sql`update users set last_login_at = now() where id = ${user.id}`);

    if (shouldUseTokenMode && !jwtDisabled) {
      try {
        const tokens = await generateAuthTokens(user.id, user.org_id, user.role);
        return res.json({
          ok: true,
            authMethod: "jwt",
            platform: "token-mode",
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            orgId: user.org_id,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      } catch (e) {
        // fall through to session mode
      }
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "session error" });
      req.session.userId = user.id;
      req.session.orgId = user.org_id;
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: "session save error" });
        res.json({
          ok: true,
          authMethod: "session",
          platform: "session-cookie",
          orgId: user.org_id,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      });
    });
  } catch (error: any) {
    console.error("[HYBRID LOGIN] Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ------------------------------ JWT refresh ------------------------------ */

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
  if (isJwtAuthDisabled()) return res.status(503).json({ error: "Token refresh unavailable" });

  try {
    const newTokens = await refreshAuthTokens(refreshToken);
    if (!newTokens) return res.status(401).json({ error: "Invalid or expired refresh token" });

    res.json({
      ok: true,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn,
    });
  } catch (error) {
    console.error("[HYBRID REFRESH] Token refresh error:", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

/* --------------------------------- Me ------------------------------------ */

router.get("/me", async (req, res) => {
  const userId = req.session?.userId;
  const orgId = req.session?.orgId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const r: any = await db.execute(sql`
      select id, name, email, role, avatar_url, avatar_seed, avatar_variant
      from users where id = ${userId}
    `);
    const user = r[0];
    if (!user) return res.status(401).json({ error: "User not found" });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      avatar_seed: user.avatar_seed,
      avatar_variant: user.avatar_variant,
      orgId,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/* ---------------------------- Password change ---------------------------- */

router.put("/password", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const r: any = await db.execute(sql`select password_hash from users where id = ${userId}`);
    const user = r[0];
    if (!user) return res.status(401).json({ error: "User not found" });

    const isValid = await bcrypt.compare(currentPassword, user.password_hash || "");
    if (!isValid) return res.status(400).json({ error: "Current password is incorrect" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.execute(sql`update users set password_hash = ${newHash} where id = ${userId}`);
    res.json({ ok: true });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

/* ----------------------------- Avatar upload ----------------------------- */

router.put("/avatar", upload.single("avatar"), async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No avatar file provided" });

  try {
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.execute(sql`update users set avatar_url = ${avatarUrl} where id = ${userId}`);
    res.json({ ok: true, avatar_url: avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

export default router;
