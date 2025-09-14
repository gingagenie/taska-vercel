import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { supportRequireAuth, supportRequireAdmin } from "../middleware/support-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { nanoid } from "nanoid";

const router = Router();

// All admin routes require support authentication and admin role
router.use([supportRequireAuth, supportRequireAdmin]);

// Validation schemas
const createUserSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['support_agent', 'support_admin']),
  password: z.string().min(8).max(100)
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  role: z.enum(['support_agent', 'support_admin']).optional()
});

const updateStatusSchema = z.object({
  is_active: z.boolean()
});

const createInviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['support_agent', 'support_admin']),
  expires_hours: z.number().min(1).max(168).default(72) // Default 3 days, max 1 week
});

const auditFiltersSchema = z.object({
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50)
});

/**
 * GET /support/api/admin/users
 * List all support users with pagination and filtering
 */
router.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Build query conditions
    let whereConditions = [];
    let queryParams: any[] = [];

    if (search) {
      whereConditions.push(`(name ILIKE $${queryParams.length + 1} OR email ILIKE $${queryParams.length + 2})`);
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (role && ['support_agent', 'support_admin'].includes(role as string)) {
      whereConditions.push(`role = $${queryParams.length + 1}`);
      queryParams.push(role);
    }

    if (status === 'active') {
      whereConditions.push(`is_active = true`);
    } else if (status === 'inactive') {
      whereConditions.push(`is_active = false`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM support_users ${whereClause}`;
    const countResult: any = await db.execute(sql.raw(countQuery, queryParams));
    const total = parseInt(countResult[0]?.total || 0);

    // Get paginated users
    const usersQuery = `
      SELECT 
        id, name, email, role, is_active, last_login_at, created_at,
        (SELECT COUNT(*) FROM support_audit_logs WHERE support_user_id = support_users.id) as action_count
      FROM support_users 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    queryParams.push(limit, offset);
    const usersResult: any = await db.execute(sql.raw(usersQuery, queryParams));

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_users_list', 'support_users', ${JSON.stringify({ filters: { search, role, status }, page, limit })}, now())
    `);

    res.json({
      users: usersResult,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error listing users:", error);
    res.status(500).json({ error: "Failed to list support users" });
  }
});

/**
 * GET /support/api/admin/users/:id
 * Get detailed information about a specific support user
 */
router.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const userResult: any = await db.execute(sql`
      SELECT 
        id, name, email, role, is_active, last_login_at, created_at,
        (SELECT COUNT(*) FROM support_audit_logs WHERE support_user_id = ${id}) as action_count,
        (SELECT COUNT(*) FROM support_tickets WHERE assigned_to = ${id}) as assigned_tickets_count,
        (SELECT MAX(created_at) FROM support_audit_logs WHERE support_user_id = ${id}) as last_action_at
      FROM support_users 
      WHERE id = ${id}
    `);

    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ error: "Support user not found" });
    }

    // Get recent activity
    const recentActivityResult: any = await db.execute(sql`
      SELECT action, details, ip_address, created_at
      FROM support_audit_logs 
      WHERE support_user_id = ${id}
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_user_view', ${id}, ${JSON.stringify({ viewed_user_id: id })}, now())
    `);

    res.json({
      user,
      recent_activity: recentActivityResult
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error getting user details:", error);
    res.status(500).json({ error: "Failed to get user details" });
  }
});

/**
 * POST /support/api/admin/users
 * Create a new support user
 */
router.post("/users", async (req, res) => {
  try {
    const validationResult = createUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { name, email, role, password } = validationResult.data;

    // Check if email already exists
    const existingUserResult: any = await db.execute(sql`
      SELECT id FROM support_users WHERE lower(email) = lower(${email})
    `);

    if (existingUserResult.length > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const newUserResult: any = await db.execute(sql`
      INSERT INTO support_users (name, email, role, password_hash, is_active, created_at)
      VALUES (${name}, ${email}, ${role}, ${passwordHash}, true, now())
      RETURNING id, name, email, role, is_active, created_at
    `);

    const newUser = newUserResult[0];

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_user_created', ${newUser.id}, ${JSON.stringify({ 
        created_user_id: newUser.id, 
        created_user_email: email, 
        created_user_role: role 
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] New support user created: ${email} (${role}) by ${req.supportUser!.email}`);

    res.status(201).json({
      user: newUser,
      message: "Support user created successfully"
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error creating user:", error);
    res.status(500).json({ error: "Failed to create support user" });
  }
});

/**
 * PUT /support/api/admin/users/:id
 * Update support user details
 */
router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { name, email, role } = validationResult.data;

    // Get current user details
    const currentUserResult: any = await db.execute(sql`
      SELECT * FROM support_users WHERE id = ${id}
    `);

    const currentUser = currentUserResult[0];
    if (!currentUser) {
      return res.status(404).json({ error: "Support user not found" });
    }

    // Prevent admin from demoting themselves
    if (id === req.supportUser!.id && role && role !== 'support_admin') {
      return res.status(400).json({ error: "Cannot change your own admin role" });
    }

    // Check email uniqueness if email is being changed
    if (email && email !== currentUser.email) {
      const existingUserResult: any = await db.execute(sql`
        SELECT id FROM support_users WHERE lower(email) = lower(${email}) AND id != ${id}
      `);

      if (existingUserResult.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    // Build update fields
    const updateFields = [];
    if (name !== undefined) updateFields.push(sql`name = ${name}`);
    if (email !== undefined) updateFields.push(sql`email = ${email}`);
    if (role !== undefined) updateFields.push(sql`role = ${role}`);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Update user
    const updateQuery = sql`
      UPDATE support_users 
      SET ${sql.join(updateFields, ', ')}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, name, email, role, is_active, created_at, updated_at
    `;

    const updatedUserResult: any = await db.execute(updateQuery);
    const updatedUser = updatedUserResult[0];

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_user_updated', ${id}, ${JSON.stringify({ 
        updated_user_id: id,
        changes: { name, email, role },
        previous_values: { 
          name: currentUser.name, 
          email: currentUser.email, 
          role: currentUser.role 
        }
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] Support user updated: ${id} by ${req.supportUser!.email}`);

    res.json({
      user: updatedUser,
      message: "Support user updated successfully"
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error updating user:", error);
    res.status(500).json({ error: "Failed to update support user" });
  }
});

/**
 * PUT /support/api/admin/users/:id/status
 * Activate or deactivate a support user
 */
router.put("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const validationResult = updateStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { is_active } = validationResult.data;

    // Get current user
    const currentUserResult: any = await db.execute(sql`
      SELECT * FROM support_users WHERE id = ${id}
    `);

    const currentUser = currentUserResult[0];
    if (!currentUser) {
      return res.status(404).json({ error: "Support user not found" });
    }

    // Prevent admin from deactivating themselves
    if (id === req.supportUser!.id && !is_active) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    // Update status
    const updatedUserResult: any = await db.execute(sql`
      UPDATE support_users 
      SET is_active = ${is_active}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, name, email, role, is_active, created_at, updated_at
    `);

    const updatedUser = updatedUserResult[0];

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, ${is_active ? 'admin_user_activated' : 'admin_user_deactivated'}, ${id}, ${JSON.stringify({ 
        target_user_id: id,
        target_user_email: currentUser.email,
        previous_status: currentUser.is_active
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] Support user ${is_active ? 'activated' : 'deactivated'}: ${id} by ${req.supportUser!.email}`);

    res.json({
      user: updatedUser,
      message: `Support user ${is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error updating user status:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

/**
 * DELETE /support/api/admin/users/:id
 * Soft delete a support user
 */
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // Get current user
    const currentUserResult: any = await db.execute(sql`
      SELECT * FROM support_users WHERE id = ${id}
    `);

    const currentUser = currentUserResult[0];
    if (!currentUser) {
      return res.status(404).json({ error: "Support user not found" });
    }

    // Prevent admin from deleting themselves
    if (id === req.supportUser!.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Check if user has active assignments
    const activeTicketsResult: any = await db.execute(sql`
      SELECT COUNT(*) as count FROM support_tickets 
      WHERE assigned_to = ${id} AND status IN ('open', 'in_progress')
    `);

    const activeTicketsCount = parseInt(activeTicketsResult[0]?.count || 0);
    if (activeTicketsCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete user with ${activeTicketsCount} active ticket assignments. Please reassign tickets first.` 
      });
    }

    // Soft delete by marking as inactive and updating email to prevent conflicts
    const deletedEmail = `deleted_${Date.now()}_${currentUser.email}`;
    
    await db.execute(sql`
      UPDATE support_users 
      SET 
        is_active = false, 
        email = ${deletedEmail}
      WHERE id = ${id}
    `);

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_user_deleted', ${id}, ${JSON.stringify({ 
        deleted_user_id: id,
        deleted_user_email: currentUser.email,
        deleted_user_role: currentUser.role
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] Support user deleted: ${id} (${currentUser.email}) by ${req.supportUser!.email}`);

    res.json({
      message: "Support user deleted successfully"
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete support user" });
  }
});

/**
 * GET /support/api/admin/invites
 * List all pending invites
 */
router.get("/invites", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Get pending invites
    const invitesResult: any = await db.execute(sql`
      SELECT 
        id, email, token, expires_at, created_at,
        (expires_at < now()) as is_expired,
        invited_by as created_by_id,
        (SELECT name FROM support_users WHERE id = support_invites.invited_by) as created_by_name
      FROM support_invites 
      WHERE used_at IS NULL
      ORDER BY created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Count total pending invites
    const countResult: any = await db.execute(sql`
      SELECT COUNT(*) as total FROM support_invites 
      WHERE used_at IS NULL
    `);

    const total = parseInt(countResult[0]?.total || 0);

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_invites_list', 'support_invites', ${JSON.stringify({ page, limit })}, now())
    `);

    res.json({
      invites: invitesResult,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error listing invites:", error);
    res.status(500).json({ error: "Failed to list invites" });
  }
});

/**
 * POST /support/api/admin/invites
 * Create a new invite for support user
 */
router.post("/invites", async (req, res) => {
  try {
    const validationResult = createInviteSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { email, role, expires_hours } = validationResult.data;

    // Check if email already exists in support users
    const existingUserResult: any = await db.execute(sql`
      SELECT id FROM support_users WHERE lower(email) = lower(${email})
    `);

    if (existingUserResult.length > 0) {
      return res.status(409).json({ error: "Email already has a support account" });
    }

    // Check if there's already a pending invite for this email
    const existingInviteResult: any = await db.execute(sql`
      SELECT id FROM support_invites 
      WHERE lower(email) = lower(${email}) 
      AND used_at IS NULL 
      AND expires_at > now()
    `);

    if (existingInviteResult.length > 0) {
      return res.status(409).json({ error: "Pending invite already exists for this email" });
    }

    // Generate secure token
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + expires_hours * 60 * 60 * 1000);

    // Create invite (note: role is stored separately in metadata since table doesn't have role column)
    const newInviteResult: any = await db.execute(sql`
      INSERT INTO support_invites (email, token, expires_at, invited_by, created_at)
      VALUES (${email}, ${token}, ${expiresAt.toISOString()}, ${req.supportUser!.id}, now())
      RETURNING id, email, token, expires_at, created_at
    `);

    const newInvite = newInviteResult[0];

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_invite_created', ${newInvite.id}, ${JSON.stringify({ 
        invite_id: newInvite.id,
        invite_email: email,
        invite_role: role,
        expires_hours
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] Invite created for ${email} (${role}) by ${req.supportUser!.email}`);

    res.status(201).json({
      invite: newInvite,
      message: "Invite created successfully",
      // Include invite URL for easy sharing (in production, this would be sent via email)
      invite_url: `${req.protocol}://${req.get('host')}/support/register?token=${token}`
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error creating invite:", error);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

/**
 * DELETE /support/api/admin/invites/:id
 * Cancel an invite
 */
router.delete("/invites/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid invite ID format" });
    }

    // Get current invite
    const inviteResult: any = await db.execute(sql`
      SELECT * FROM support_invites WHERE id = ${id}
    `);

    const invite = inviteResult[0];
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.used_at) {
      return res.status(400).json({ error: "Invite has already been used" });
    }

    // Since we don't have cancelled_at field, we'll delete the invite instead
    await db.execute(sql`
      DELETE FROM support_invites 
      WHERE id = ${id}
    `);

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_invite_cancelled', ${id}, ${JSON.stringify({ 
        invite_id: id,
        invite_email: invite.email
      })}, now())
    `);

    console.log(`[SUPPORT ADMIN] Invite cancelled: ${id} (${invite.email}) by ${req.supportUser!.email}`);

    res.json({
      message: "Invite cancelled successfully"
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error cancelling invite:", error);
    res.status(500).json({ error: "Failed to cancel invite" });
  }
});

/**
 * GET /support/api/admin/audit
 * View audit logs with filtering
 */
router.get("/audit", async (req, res) => {
  try {
    const validationResult = auditFiltersSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: validationResult.error.flatten()
      });
    }

    const { user_id, action, start_date, end_date, page, limit } = validationResult.data;
    const offset = (Number(page) - 1) * Number(limit);

    // Build query conditions
    let whereConditions = [];
    let queryParams: any[] = [];

    if (user_id) {
      whereConditions.push(`sal.actor_id = $${queryParams.length + 1}`);
      queryParams.push(user_id);
    }

    if (action) {
      whereConditions.push(`sal.action ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${action}%`);
    }

    if (start_date) {
      whereConditions.push(`sal.created_at >= $${queryParams.length + 1}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`sal.created_at <= $${queryParams.length + 1}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM support_audit_logs sal ${whereClause}`;
    const countResult: any = await db.execute(sql.raw(countQuery, queryParams));
    const total = parseInt(countResult[0]?.total || 0);

    // Get audit logs
    const auditQuery = `
      SELECT 
        sal.id, sal.action, sal.target, sal.meta, sal.created_at,
        sal.actor_id,
        su.name as user_name, su.email as user_email
      FROM support_audit_logs sal
      LEFT JOIN support_users su ON sal.actor_id = su.id
      ${whereClause}
      ORDER BY sal.created_at DESC 
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    queryParams.push(limit, offset);
    const auditResult: any = await db.execute(sql.raw(auditQuery, queryParams));

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_audit_viewed', 'support_audit_logs', ${JSON.stringify({ filters: { user_id, action, start_date, end_date }, page, limit })}, now())
    `);

    res.json({
      audit_logs: auditResult,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error getting audit logs:", error);
    res.status(500).json({ error: "Failed to get audit logs" });
  }
});

/**
 * GET /support/api/admin/stats
 * Get admin dashboard statistics
 */
router.get("/stats", async (req, res) => {
  try {
    // Get user statistics
    const userStatsResult: any = await db.execute(sql`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_active = true) as active_users,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_users,
        COUNT(*) FILTER (WHERE role = 'support_admin') as admin_users,
        COUNT(*) FILTER (WHERE role = 'support_user') as regular_users,
        COUNT(*) FILTER (WHERE last_login_at > now() - interval '7 days') as recent_logins
      FROM support_users
      WHERE deleted_at IS NULL
    `);

    // Get invite statistics
    const inviteStatsResult: any = await db.execute(sql`
      SELECT 
        COUNT(*) as total_invites,
        COUNT(*) FILTER (WHERE used_at IS NOT NULL) as used_invites,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) as cancelled_invites,
        COUNT(*) FILTER (WHERE used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) as pending_invites,
        COUNT(*) FILTER (WHERE expires_at < now() AND used_at IS NULL AND cancelled_at IS NULL) as expired_invites
      FROM support_invites
    `);

    // Get recent activity count
    const activityStatsResult: any = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') as last_7d,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') as last_30d
      FROM support_audit_logs
    `);

    // Log admin action
    await db.execute(sql`
      INSERT INTO support_audit_logs (actor_id, action, target, meta, created_at)
      VALUES (${req.supportUser!.id}, 'admin_stats_viewed', 'support_users', ${JSON.stringify({})}, now())
    `);

    res.json({
      user_stats: userStatsResult[0],
      invite_stats: inviteStatsResult[0],
      activity_stats: activityStatsResult[0]
    });
  } catch (error) {
    console.error("[SUPPORT ADMIN] Error getting stats:", error);
    res.status(500).json({ error: "Failed to get admin statistics" });
  }
});

export default router;