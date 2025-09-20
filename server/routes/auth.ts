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