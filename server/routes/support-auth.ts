import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { generateSupportToken } from "../lib/secure-support-token";

declare module 'express-session' {
  interface SessionData {
    // Regular user session
    userId?: string;
    orgId?: string;
    // Support staff session (separate)
    supportUserId?: string;
    supportUserRole?: string;
  }
}

const router = Router();

// Support staff login - completely separate from customer authentication
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    // Log login attempt (before authentication for security monitoring)
    console.log(`[SUPPORT AUTH] Login attempt from IP: ${req.ip}`);
    
    // Find support user by email
    const result: any = await db.execute(sql`
      SELECT id, email, password_hash, name, role, is_active
      FROM support_users
      WHERE lower(email) = lower(${email})
      AND is_active = true
      LIMIT 1
    `);
    
    const supportUser = result[0];
    
    if (!supportUser) {
      // Log failed login attempt
      await db.execute(sql`
        INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
        VALUES ('login_failed', NULL, ${JSON.stringify({ email, reason: 'user_not_found' })}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
      `);
      
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, supportUser.password_hash || "");
    
    if (!isValidPassword) {
      // Log failed login attempt
      await db.execute(sql`
        INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
        VALUES ('login_failed', ${supportUser.id}, ${JSON.stringify({ email, reason: 'invalid_password' })}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
      `);
      
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login timestamp
    await db.execute(sql`
      UPDATE support_users 
      SET last_login_at = now() 
      WHERE id = ${supportUser.id}
    `);

    // Create new session for support user
    req.session.regenerate((err) => {
      if (err) {
        console.error("[SUPPORT AUTH] Session regeneration error:", err);
        return res.status(500).json({ error: "Session error" });
      }
      
      // Set support user session data
      req.session.supportUserId = supportUser.id;
      req.session.supportUserRole = supportUser.role;
      
      req.session.save(async (err2) => {
        if (err2) {
          console.error("[SUPPORT AUTH] Session save error:", err2);
          return res.status(500).json({ error: "Session save error" });
        }
        
        // Log successful login
        try {
          await db.execute(sql`
            INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
            VALUES ('login', ${supportUser.id}, ${JSON.stringify({ email })}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
          `);
        } catch (auditError) {
          console.error("[SUPPORT AUTH] Audit log error:", auditError);
        }
        
        console.log(`[SUPPORT AUTH] Successful login for user_id: ${supportUser.id}`);
        
        // Generate secure, cryptographically signed support token
        // This replaces the forgeable boolean marker with tamper-proof authentication
        const secureToken = generateSupportToken(supportUser.id, supportUser.role);
        
        // Set secure support token cookie for cross-path detection
        // This token is HMAC-signed and cannot be forged by customers
        res.cookie('support_token', secureToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 2 * 60 * 60 * 1000 // 2 hours to match token expiration
        });
        
        res.json({ 
          ok: true, 
          user: { 
            id: supportUser.id, 
            name: supportUser.name, 
            email: supportUser.email, 
            role: supportUser.role 
          } 
        });
      });
    });
  } catch (error: any) {
    console.error("[SUPPORT AUTH] Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Support staff logout
router.post("/logout", async (req, res) => {
  const supportUserId = req.session?.supportUserId;
  
  if (supportUserId) {
    try {
      // Log logout action
      await db.execute(sql`
        INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
        VALUES ('logout', ${supportUserId}, ${JSON.stringify({})}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
      `);
      
      console.log(`[SUPPORT AUTH] Logout for support user: ${supportUserId}`);
    } catch (auditError) {
      console.error("[SUPPORT AUTH] Audit log error on logout:", auditError);
    }
  }
  
  // Destroy session and clear support session data
  req.session.destroy((err) => {
    if (err) {
      console.error("[SUPPORT AUTH] Session destroy error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    
    // Clear secure support token cookie
    res.clearCookie('support_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    
    console.log(`[SUPPORT AUTH] Cleared secure support token on logout`);
    res.json({ ok: true });
  });
});

// Get current support user info
router.get("/me", async (req, res) => {
  const supportUserId = req.session?.supportUserId;
  
  if (!supportUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  try {
    // Fetch current support user info
    const result: any = await db.execute(sql`
      SELECT id, name, email, role, is_active, created_at, last_login_at
      FROM support_users 
      WHERE id = ${supportUserId} 
      AND is_active = true
    `);
    
    const supportUser = result[0];
    
    if (!supportUser) {
      return res.status(401).json({ error: "Support user not found or inactive" });
    }
    
    res.json({ 
      id: supportUser.id,
      name: supportUser.name,
      email: supportUser.email,
      role: supportUser.role,
      isActive: supportUser.is_active,
      createdAt: supportUser.created_at,
      lastLoginAt: supportUser.last_login_at
    });
  } catch (error) {
    console.error("[SUPPORT AUTH] Error fetching support user:", error);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

// Password change endpoint for support users
router.put("/password", async (req, res) => {
  const supportUserId = req.session?.supportUserId;
  if (!supportUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password required" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  try {
    // Get current password hash
    const result: any = await db.execute(sql`
      SELECT password_hash, email FROM support_users WHERE id = ${supportUserId}
    `);
    const supportUser = result[0];
    
    if (!supportUser) {
      return res.status(401).json({ error: "Support user not found" });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, supportUser.password_hash || "");
    if (!isValid) {
      // Log failed password change attempt
      await db.execute(sql`
        INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
        VALUES ('password_change_failed', ${supportUserId}, ${JSON.stringify({ reason: 'invalid_current_password' })}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
      `);
      
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 12); // Higher rounds for support users
    await db.execute(sql`
      UPDATE support_users SET password_hash = ${newHash} WHERE id = ${supportUserId}
    `);

    // Log successful password change
    await db.execute(sql`
      INSERT INTO support_audit_logs (action, support_user_id, details, ip_address, user_agent, created_at)
      VALUES ('password_changed', ${supportUserId}, ${JSON.stringify({})}, ${req.ip}, ${req.get('User-Agent') || 'unknown'}, now())
    `);

    console.log(`[SUPPORT AUTH] Password changed for support user_id: ${supportUserId}`);
    res.json({ ok: true });
  } catch (error) {
    console.error("[SUPPORT AUTH] Password change error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
