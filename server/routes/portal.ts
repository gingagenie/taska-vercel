
import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import jobsRouter from "./jobs";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const portalRouter = Router();

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function isUuid(str: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(str);
}

function getPortalCustomerId(req: any): string | null {
  return (
    req?.session?.customerId ||
    req?.session?.customer?.id ||
    null
  );
}

async function getOrgIdBySlug(orgSlug: string): Promise<string | null> {
  const r: any = await db.execute(sql`
    SELECT id
    FROM orgs
    WHERE lower(slug) = lower(${orgSlug})
    LIMIT 1
  `);
  return r?.[0]?.id || null;
}

// Add this to server/routes/portal.ts after the helper functions and before the equipment endpoints
/* --------------------------------------------------
   LOGIN
-------------------------------------------------- */

portalRouter.post("/portal/:org/login", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    const orgSlug = req.params.org;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Find customer user by email and org
    const users: any = await db.execute(sql`
      SELECT id, customer_id, email, password_hash, disabled_at
      FROM customer_users
      WHERE email = ${email}
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!users.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    // Check if account is disabled
    if (user.disabled_at) {
      return res.status(401).json({ error: "Account disabled" });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Set session
    req.session.customerId = user.customer_id;
    req.session.customerUserEmail = user.email;

    // Save session and return success
    req.session.save((err: any) => {
      if (err) {
        console.error("[portal login] Session save error:", err);
        return res.status(500).json({ error: "Login failed" });
      }
      res.json({ success: true, customerId: user.customer_id });
    });

  } catch (e: any) {
    console.error("[portal login]", e);
    res.status(500).json({ error: "Login failed" });
  }
});

/* --------------------------------------------------
   LOGOUT
-------------------------------------------------- */

portalRouter.post("/portal/:org/logout", async (req: any, res) => {
  req.session.destroy((err: any) => {
    if (err) {
      console.error("[portal logout]", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

/* --------------------------------------------------
   ME - Get current portal user info
-------------------------------------------------- */

portalRouter.get("/portal/:org/me", async (req: any, res) => {
  try {
    const orgSlug = req.params.org;
    const customerId = getPortalCustomerId(req);
    
    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Get customer details
    const customerRows: any = await db.execute(sql`
      SELECT id, name, email, phone
      FROM customers
      WHERE id = ${customerId}::uuid AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!customerRows || customerRows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerRows[0];

    res.json({
      customer_id: customer.id,
      customer_name: customer.name,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      org_id: orgId,
    });
  } catch (error: any) {
    console.error("Error fetching portal customer info:", error);
    res.status(500).json({ error: "Failed to fetch customer info" });
  }
});

/* --------------------------------------------------
   Debug
-------------------------------------------------- */

portalRouter.get("/portal/:org/debug-session", async (req: any, res) => {
  const orgSlug = req.params.org;
  const orgId = await getOrgIdBySlug(orgSlug);

  res.json({
    orgSlug,
    orgId,
    session: {
      customerId: req?.session?.customerId || null,
      customer: req?.session?.customer || null,
    },
    cookie: req.headers?.cookie || null,
  });
});

/* --------------------------------------------------
   Equipment
-------------------------------------------------- */

portalRouter.get("/portal/:org/equipment", async (req: any, res) => {
  try {
    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT id, name, make, model, serial_number, last_service_date, next_service_date
      FROM equipment
      WHERE org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      ORDER BY name ASC
    `);

    res.json(r);
  } catch (e: any) {
    console.error("[portal equipment]", e);
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

portalRouter.get("/portal/:org/equipment/:id", async (req: any, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid equipment id" });

  try {
    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const eq: any = await db.execute(sql`
      SELECT *
      FROM equipment
      WHERE id = ${id}::uuid
        AND org_id = ${orgId}::uuid
        AND customer_id = ${customerId}::uuid
      LIMIT 1
    `);

    if (!eq.length) return res.status(404).json({ error: "Equipment not found" });

    const jobs: any = await db.execute(sql`
      SELECT DISTINCT cj.id, cj.title, cj.completed_at
      FROM completed_jobs cj
      INNER JOIN completed_job_equipment cje ON cje.completed_job_id = cj.id
      WHERE cj.org_id = ${orgId}::uuid
       AND cj.customer_id = ${customerId}::uuid
       AND cje.equipment_id = ${id}::uuid
     ORDER BY cj.completed_at DESC
   `);
     
    res.json({ equipment: eq[0], jobs });
  } catch (e: any) {
    console.error("[portal equipment detail]", e);
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

/* --------------------------------------------------
   SERVICE SHEET (proxy to jobs.ts)
-------------------------------------------------- */

portalRouter.get(
  "/portal/:org/completed-jobs/:completedJobId/service-sheet",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT customer_id
      FROM completed_jobs
      WHERE id = ${completedJobId}::uuid
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!r.length) return res.status(404).json({ error: "Completed job not found" });
    if (String(r[0].customer_id) !== String(customerId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.isPortal = true;
    req.customerId = customerId;
    req.orgId = orgId;

    req.url = `/completed/${completedJobId}/service-sheet${req._parsedUrl?.search || ""}`;
    return (jobsRouter as any)(req, res, next);
  }
);

/* --------------------------------------------------
   ✅ CONVERT TO INVOICE (THE FIX)
-------------------------------------------------- */

portalRouter.post(
  "/portal/:org/jobs/completed/:completedJobId/convert-to-invoice",
  async (req: any, res: any, next: any) => {
    const { completedJobId } = req.params;
    if (!isUuid(completedJobId)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const orgId = await getOrgIdBySlug(req.params.org);
    if (!orgId) return res.status(404).json({ error: "Org not found" });

    const customerId = getPortalCustomerId(req);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });

    const r: any = await db.execute(sql`
      SELECT customer_id
      FROM completed_jobs
      WHERE id = ${completedJobId}::uuid
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!r.length) return res.status(404).json({ error: "Completed job not found" });
    if (String(r[0].customer_id) !== String(customerId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.isPortal = true;
    req.customerId = customerId;
    req.orgId = orgId;

    // 🔁 forward into jobs.ts
    req.url = `/completed/${completedJobId}/convert-to-invoice`;
    return (jobsRouter as any)(req, res, next);
  }
);

// Generate password reset token (expires in 1 hour)
function generateResetToken(): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return { token, expires };
}

/* --------------------------------------------------
   FORGOT PASSWORD - Request password reset
-------------------------------------------------- */

portalRouter.post("/portal/:org/forgot-password", async (req: any, res) => {
  try {
    const { email } = req.body;
    const orgSlug = req.params.org;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Find customer user
    const users: any = await db.execute(sql`
      SELECT id, email, customer_id
      FROM customer_users
      WHERE email = ${email}
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    // Always return success even if email not found (security best practice)
    if (!users.length) {
      console.log(`[PASSWORD_RESET] Email not found: ${email}`);
      return res.json({ 
        success: true, 
        message: "If an account exists with that email, a password reset link has been sent." 
      });
    }

    const user = users[0];

    // Generate reset token
    const { token, expires } = generateResetToken();
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Store token in database
    await db.execute(sql`
      UPDATE customer_users 
      SET 
        reset_token = ${hashedToken},
        reset_token_expires = ${expires.toISOString()}
      WHERE id = ${user.id}::uuid
    `);

    // Send reset email
    const { sendEmail } = await import('../services/email');
    const resetUrl = `${req.protocol}://${req.get('host')}/portal/${orgSlug}/reset-password?token=${token}`;
    
    await sendEmail({
      to: user.email,
      from: "Taska <noreply@taska.info>",
      subject: "Reset Your Portal Password",
      html: generatePasswordResetEmail(resetUrl),
      text: `Reset your password by clicking this link: ${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`
    });

    console.log(`[PASSWORD_RESET] Reset email sent to: ${email}`);
    
    res.json({ 
      success: true, 
      message: "If an account exists with that email, a password reset link has been sent." 
    });

  } catch (e: any) {
    console.error("[PASSWORD_RESET] Error:", e);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

/* --------------------------------------------------
   RESET PASSWORD - Use token to set new password
-------------------------------------------------- */

portalRouter.post("/portal/:org/reset-password", async (req: any, res) => {
  try {
    const { token, password } = req.body;
    const orgSlug = req.params.org;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Hash the token to match what's stored
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const users: any = await db.execute(sql`
      SELECT id, email
      FROM customer_users
      WHERE reset_token = ${hashedToken}
        AND reset_token_expires > NOW()
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!users.length) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const user = users[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await db.execute(sql`
      UPDATE customer_users 
      SET 
        password_hash = ${passwordHash},
        reset_token = NULL,
        reset_token_expires = NULL
      WHERE id = ${user.id}::uuid
    `);

    console.log(`[PASSWORD_RESET] Password reset successful for: ${user.email}`);

    res.json({ 
      success: true, 
      message: "Password has been reset successfully. You can now log in with your new password." 
    });

  } catch (e: any) {
    console.error("[PASSWORD_RESET] Error:", e);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

/* --------------------------------------------------
   CHANGE PASSWORD - For logged-in users
-------------------------------------------------- */

portalRouter.post("/portal/:org/change-password", async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const orgSlug = req.params.org;

    const customerId = getPortalCustomerId(req);
    if (!customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const orgId = await getOrgIdBySlug(orgSlug);
    if (!orgId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Get user
    const users: any = await db.execute(sql`
      SELECT id, email, password_hash
      FROM customer_users
      WHERE customer_id = ${customerId}::uuid
        AND org_id = ${orgId}::uuid
      LIMIT 1
    `);

    if (!users.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.execute(sql`
      UPDATE customer_users 
      SET password_hash = ${passwordHash}
      WHERE id = ${user.id}::uuid
    `);

    console.log(`[PASSWORD_CHANGE] Password changed for: ${user.email}`);

    res.json({ 
      success: true, 
      message: "Password changed successfully" 
    });

  } catch (e: any) {
    console.error("[PASSWORD_CHANGE] Error:", e);
    res.status(500).json({ error: "Failed to change password" });
  }
});

/* --------------------------------------------------
   EMAIL TEMPLATE
-------------------------------------------------- */

function generatePasswordResetEmail(resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Reset Your Password</h1>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin-top: 0;">You requested to reset your password for your Taska customer portal account.</p>
        
        <p style="font-size: 16px;">Click the button below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; padding: 14px 32px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
            Reset Password
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
        <p style="font-size: 14px; color: #2563eb; word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px;">
          ${resetUrl}
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
            <strong>This link will expire in 1 hour.</strong>
          </p>
          <p style="font-size: 14px; color: #666;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          </p>
        </div>
      </div>
      
      <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
        <p>This email was sent from Taska Equipment Portal</p>
      </div>
    </body>
    </html>
  `;
}




















































































































export default portalRouter;
