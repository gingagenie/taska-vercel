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
import Stripe from 'stripe';
import { subscriptionPlans } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from 'nanoid';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    orgId?: string;
  }
}

const router = Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = (req.session as any).userId;
    const ext = path.extname(file.originalname);
    cb(null, `${userId}-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

router.post("/register", async (req, res) => {
  const { orgName, name, email, password } = req.body || {};
  if (!orgName || !email || !password) {
    return res.status(400).json({ error: "orgName, email, password required" });
  }

  try {
    // Create organization
    const orgIns: any = await db.execute(sql`
      insert into orgs (name) values (${orgName}) returning id
    `);
    const orgId = orgIns[0].id;

    // Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    const userIns: any = await db.execute(sql`
      insert into users (org_id, name, email, password_hash, role)
      values (${orgId}, ${name || 'Owner'}, ${email}, ${hash}, 'admin')
      returning id, name, email, role
    `);
    const user = userIns[0];

    // Create 14-day Pro trial subscription for new org
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);
    
    await db.execute(sql`
      insert into org_subscriptions (org_id, plan_id, status, trial_end, current_period_end)
      values (${orgId}, 'pro', 'trial', ${trialEndDate.toISOString()}, ${trialEndDate.toISOString()})
    `);

    // Track TikTok CompleteRegistration event (non-blocking)
    try {
      const customerInfo: CustomerInfo = {
        email: email,
        firstName: name?.split(' ')[0] || undefined,
        lastName: name?.split(' ').slice(1).join(' ') || undefined,
        ip: req.ip || req.connection.remoteAddress || '',
        userAgent: req.get('User-Agent') || '',
        country: 'AU', // Default to Australia for Taska
      };

      const registrationData = {
        value: 100, // Estimated customer lifetime value for tracking
        currency: 'AUD',
        status: 'completed',
        contentName: 'User Registration - New Account Created',
      };

      // Fire and forget - don't wait for response to avoid slowing down registration
      tiktokEvents.trackCompleteRegistration(
        customerInfo,
        registrationData,
        req.get('Referer') || undefined,
        req.get('Referer') || undefined
      ).catch((trackingError) => {
        // Log tracking errors but don't throw them
        console.error('[REGISTRATION] TikTok tracking failed:', trackingError);
      });

      console.log(`[REGISTRATION] TikTok CompleteRegistration tracking initiated for user_id: ${user.id}`);
    } catch (trackingError) {
      // Log any tracking errors but don't let them break registration
      console.error('[REGISTRATION] TikTok tracking error:', trackingError);
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

// New trial-with-card-required registration flow
router.post("/register-with-trial", async (req, res) => {
  const { orgName, name, email, password, planId } = req.body || {};
  
  if (!orgName || !email || !password || !planId) {
    return res.status(400).json({ error: "All fields required" });
  }
  
  if (!['solo', 'pro', 'enterprise'].includes(planId)) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }
  
  try {
    // Check if email already exists
    const existingUser: any = await db.execute(sql`
      select id from users where lower(email) = lower(${email}) limit 1
    `);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }
    
    // Get plan details and validate AUD price exists
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (!plan) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    
    if (!plan.stripePriceId) {
      console.error(`❌ CRITICAL: Plan ${planId} missing stripe_price_id`);
      return res.status(500).json({ error: "Plan not configured properly" });
    }
    
    // Hash password now, create cryptographically strong token
    const passwordHash = await bcrypt.hash(password, 10);
    const registrationToken = nanoid(32); // Secure random token
    
    // Store pending registration in database
    await db.execute(sql`
      INSERT INTO pending_registrations (token, org_name, user_name, email, password_hash, plan_id, stripe_price_id)
      VALUES (${registrationToken}, ${orgName}, ${name || 'Owner'}, ${email}, ${passwordHash}, ${planId}, ${plan.stripePriceId})
    `);
    
    // Clean up old pending registrations (older than 24 hours)
    await db.execute(sql`
      DELETE FROM pending_registrations WHERE created_at < NOW() - INTERVAL '24 hours'
    `);
    
    console.log(`[TRIAL REG] Stored pending registration for ${email}, token: ${registrationToken.substring(0, 8)}...`);
    
    // Create Stripe checkout session with 14-day trial
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email, // Lock session to this email
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          registration_token: registrationToken,
          plan_id: planId
        }
      },
      success_url: `${req.protocol}://${req.get('host')}/auth/complete-registration?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/auth/register?canceled=true`,
      metadata: {
        registration_token: registrationToken
      }
    });
    
    console.log(`[TRIAL REG] Created Stripe checkout session: ${checkoutSession.id}`);
    
    res.json({ checkoutUrl: checkoutSession.url });
  } catch (error: any) {
    console.error("[TRIAL REG] Error:", error);
    res.status(500).json({ error: "Failed to initiate registration" });
  }
});

// Complete registration after Stripe checkout
router.get("/complete-registration", async (req, res) => {
  const { session_id } = req.query;
  
  if (!session_id || typeof session_id !== 'string') {
    return res.redirect('/auth/register?error=invalid_session');
  }
  
  try {
    // Retrieve Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    
    if (checkoutSession.status !== 'complete') {
      console.error('[TRIAL REG] Checkout session not complete:', checkoutSession.status);
      return res.redirect('/auth/register?error=payment_incomplete');
    }
    
    const registrationToken = checkoutSession.metadata?.registration_token;
    if (!registrationToken) {
      console.error('[TRIAL REG] No registration token in metadata');
      return res.redirect('/auth/register?error=missing_data');
    }
    
    // Get pending registration data from database
    const pendingRegs: any = await db.execute(sql`
      SELECT * FROM pending_registrations WHERE token = ${registrationToken} LIMIT 1
    `);
    
    if (pendingRegs.length === 0) {
      console.error('[TRIAL REG] Pending registration not found or expired');
      return res.redirect('/auth/register?error=expired');
    }
    
    const pendingReg = pendingRegs[0];
    
    // Fetch the Stripe subscription to get actual trial_end and validate
    if (!checkoutSession.subscription) {
      console.error('[TRIAL REG] No subscription ID in checkout session');
      return res.redirect('/auth/register?error=no_subscription');
    }
    
    const stripeSubscription = await stripe.subscriptions.retrieve(checkoutSession.subscription as string);
    
    // SECURITY: Validate email matches between Stripe session and pending registration
    const checkoutEmail = checkoutSession.customer_details?.email || checkoutSession.customer_email;
    if (!checkoutEmail || checkoutEmail.toLowerCase() !== pendingReg.email.toLowerCase()) {
      console.error('[TRIAL REG] Email mismatch! Session:', checkoutEmail, 'Pending:', pendingReg.email);
      return res.redirect('/auth/register?error=email_mismatch');
    }
    
    // SECURITY: Use database-stored price ID (not metadata which can be tampered)
    const expectedPriceId = pendingReg.stripe_price_id;
    const actualPriceId = stripeSubscription.items.data[0]?.price.id;
    
    if (actualPriceId !== expectedPriceId) {
      console.error('[TRIAL REG] Price mismatch! Expected:', expectedPriceId, 'Got:', actualPriceId);
      return res.redirect('/auth/register?error=plan_mismatch');
    }
    
    // Use Stripe's actual trial_end timestamp (not locally calculated)
    const trialEndTimestamp = stripeSubscription.trial_end;
    if (!trialEndTimestamp) {
      console.error('[TRIAL REG] No trial_end in Stripe subscription');
      return res.redirect('/auth/register?error=no_trial');
    }
    
    const trialEndDate = new Date(trialEndTimestamp * 1000);
    const currentPeriodEnd = (stripeSubscription as any).current_period_end 
      ? new Date((stripeSubscription as any).current_period_end * 1000) 
      : trialEndDate;
    
    console.log(`[TRIAL REG] Stripe trial ends: ${trialEndDate.toISOString()}, plan: ${pendingReg.plan_id}, price: ${actualPriceId}`);
    
    // Check if account already exists (prevent duplicate creation on refresh)
    const existingUser: any = await db.execute(sql`
      SELECT id FROM users WHERE lower(email) = lower(${pendingReg.email}) LIMIT 1
    `);
    
    if (existingUser.length > 0) {
      console.log('[TRIAL REG] User already exists, logging in');
      const user = existingUser[0];
      const userOrg: any = await db.execute(sql`
        SELECT org_id FROM users WHERE id = ${user.id} LIMIT 1
      `);
      
      // Log them in to existing account
      req.session.regenerate((err) => {
        if (err) return res.redirect('/auth/login?registered=true');
        req.session.userId = user.id;
        req.session.orgId = userOrg[0].org_id;
        req.session.save(() => res.redirect('/?welcome=true'));
      });
      return;
    }
    
    // Create organization
    const orgIns: any = await db.execute(sql`
      insert into orgs (name) values (${pendingReg.org_name}) returning id
    `);
    const orgId = orgIns[0].id;
    
    // Create user
    const userIns: any = await db.execute(sql`
      insert into users (org_id, name, email, password_hash, role)
      values (${orgId}, ${pendingReg.user_name}, ${pendingReg.email}, ${pendingReg.password_hash}, 'admin')
      returning id, name, email, role
    `);
    const user = userIns[0];
    
    // Create subscription record with Stripe's actual trial_end
    await db.execute(sql`
      insert into org_subscriptions (
        org_id, plan_id, status, trial_end, current_period_end,
        stripe_customer_id, stripe_subscription_id
      )
      values (
        ${orgId}, ${pendingReg.plan_id}, 'trial', ${trialEndDate.toISOString()}, ${currentPeriodEnd.toISOString()},
        ${checkoutSession.customer as string}, ${checkoutSession.subscription as string}
      )
    `);
    
    // Clean up pending registration from database
    await db.execute(sql`
      DELETE FROM pending_registrations WHERE token = ${registrationToken}
    `);
    
    console.log(`[TRIAL REG] ✅ Registration completed for ${pendingReg.email}, org: ${orgId}, user: ${user.id}`);
    
    // Track TikTok CompleteRegistration event
    try {
      const customerInfo: CustomerInfo = {
        email: pendingReg.email,
        firstName: pendingReg.user_name?.split(' ')[0] || undefined,
        lastName: pendingReg.user_name?.split(' ').slice(1).join(' ') || undefined,
        ip: req.ip || req.connection.remoteAddress || '',
        userAgent: req.get('User-Agent') || '',
        country: 'AU',
      };
      
      tiktokEvents.trackCompleteRegistration(
        customerInfo,
        {
          value: 100,
          currency: 'AUD',
          status: 'completed',
          contentName: 'User Registration - Trial Started'
        },
        req.get('Referer') || undefined,
        req.get('Referer') || undefined
      ).catch(() => {});
    } catch {}
    
    // Create session and log user in
    req.session.regenerate((err) => {
      if (err) {
        console.error('[TRIAL REG] Session error:', err);
        return res.redirect('/auth/login?registered=true');
      }
      req.session.userId = user.id;
      req.session.orgId = orgId;
      req.session.save((err2) => {
        if (err2) {
          console.error('[TRIAL REG] Session save error:', err2);
          return res.redirect('/auth/login?registered=true');
        }
        // Redirect to dashboard
        res.redirect('/?welcome=true');
      });
    });
    
  } catch (error: any) {
    console.error('[TRIAL REG] Complete registration error:', error);
    res.redirect('/auth/register?error=server_error');
  }
});

router.post("/login", async (req, res) => {
  const { email, password, orgId } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email & password required" });
  }

  try {
    // Detect client platform and auth mode preference
    const authMode = req.headers['x-auth-mode'] as string;
    // SECURITY FIX: Only use token mode when client explicitly sends X-Auth-Mode: token header
    // This prevents breaking Android Capacitor and iOS Safari users who should use cookies
    const shouldUseTokenMode = authMode === 'token';
    const jwtDisabled = isJwtAuthDisabled();
    
    console.log(`[HYBRID LOGIN] Login attempt - auth-mode: ${authMode || 'not-specified'}, token mode: ${shouldUseTokenMode}, JWT disabled: ${jwtDisabled}`);
    
    // Find user by email (optionally scoped to org)
    const r: any = await db.execute(sql`
      select id, org_id, email, password_hash, name, role
      from users
      where lower(email) = lower(${email})
      ${orgId ? sql`and org_id = ${orgId}` : sql``}
      order by created_at asc
      limit 1
    `);
    const user = r[0];
    
    if (!user) {
      console.log(`[HYBRID LOGIN] User not found for email: ${email.substring(0, 3)}***`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const ok = await bcrypt.compare(password, user.password_hash || "");
    
    if (!ok) {
      console.log(`[HYBRID LOGIN] Invalid password for user: ${user.id}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login timestamp
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp
    `);
    await db.execute(sql`update users set last_login_at = now() where id = ${user.id}`);

    // HYBRID AUTH: Choose authentication method based on explicit client request
    if (shouldUseTokenMode && !jwtDisabled) {
      // Token Mode Client - Return JWT tokens (only when explicitly requested)
      console.log(`[HYBRID LOGIN] Token mode explicitly requested, generating JWT tokens for user ${user.id}`);
      
      try {
        const tokens = await generateAuthTokens(user.id, user.org_id, user.role);
        
        console.log(`[HYBRID LOGIN] JWT tokens generated successfully for token mode user ${user.id}`);
        
        // Return tokens for token mode clients
        res.json({
          ok: true,
          authMethod: 'jwt',
          platform: 'token-mode',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          orgId: user.org_id,
          user: { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            role: user.role 
          }
        });
        return;
      } catch (tokenError) {
        console.error(`[HYBRID LOGIN] JWT token generation failed for user ${user.id}:`, tokenError);
        // Fall back to session auth if JWT fails
        console.log(`[HYBRID LOGIN] Falling back to session auth for user ${user.id}`);
      }
    }

    // Session Cookie Mode (Default for all clients unless explicitly requesting tokens)
    console.log(`[HYBRID LOGIN] Using session auth for user ${user.id} (token mode: ${shouldUseTokenMode}, JWT disabled: ${jwtDisabled})`);
    
    req.session.regenerate((err) => {
      if (err) {
        console.error(`[HYBRID LOGIN] Session regeneration error for user ${user.id}:`, err);
        return res.status(500).json({ error: "session error" });
      }
      
      req.session.userId = user.id;
      req.session.orgId = user.org_id;
      
      req.session.save((err2) => {
        if (err2) {
          console.error(`[HYBRID LOGIN] Session save error for user ${user.id}:`, err2);
          return res.status(500).json({ error: "session save error" });
        }
        
        console.log(`[HYBRID LOGIN] Session auth successful for user ${user.id}`);
        
        res.json({ 
          ok: true,
          authMethod: 'session',
          platform: 'session-cookie',
          orgId: user.org_id, 
          user: { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            role: user.role 
          } 
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

// JWT Token Refresh endpoint for iOS clients
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};
  
  if (!refreshToken) {
    console.log('[HYBRID REFRESH] No refresh token provided');
    return res.status(400).json({ error: "Refresh token required" });
  }

  // Check if JWT auth is disabled
  if (isJwtAuthDisabled()) {
    console.log('[HYBRID REFRESH] JWT authentication disabled, refresh not available');
    return res.status(503).json({ error: "Token refresh unavailable" });
  }

  try {
    console.log('[HYBRID REFRESH] Attempting to refresh access token');
    
    const newTokens = await refreshAuthTokens(refreshToken);
    
    if (!newTokens) {
      console.log('[HYBRID REFRESH] Refresh token invalid or expired');
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    console.log('[HYBRID REFRESH] Token refresh successful');
    
    res.json({
      ok: true,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn
    });
  } catch (error) {
    console.error('[HYBRID REFRESH] Token refresh error:', error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

router.get("/me", async (req, res) => {
  const userId = req.session?.userId;
  const orgId = req.session?.orgId;
  
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  try {
    // Fetch full user info from database
    const r: any = await db.execute(sql`
      select id, name, email, role, avatar_url, avatar_seed, avatar_variant
      from users 
      where id = ${userId}
    `);
    const user = r[0];
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    res.json({ 
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      avatar_seed: user.avatar_seed,
      avatar_variant: user.avatar_variant,
      orgId: orgId
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Password change endpoint
router.put("/password", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    // Get current password hash
    const r: any = await db.execute(sql`
      select password_hash from users where id = ${userId}
    `);
    const user = r[0];
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash || "");
    if (!isValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.execute(sql`
      update users set password_hash = ${newHash} where id = ${userId}
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Avatar upload endpoint
router.put("/avatar", upload.single("avatar"), async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No avatar file provided" });
  }

  try {
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    
    await db.execute(sql`
      update users set avatar_url = ${avatarUrl} where id = ${userId}
    `);

    res.json({ ok: true, avatar_url: avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

export default router;