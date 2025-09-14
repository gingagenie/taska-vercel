import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { eq, and, desc, asc, isNull, isNotNull } from "drizzle-orm";
import { supportTickets, ticketCategories, ticketMessages, ticketAssignments, users, organizations, insertSupportTicketSchema, insertTicketMessageSchema, insertTicketAssignmentSchema } from "../../shared/schema";
import { detectSupportStaff, requireTicketAccess, requireSupportStaff } from "../middleware/support-staff";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// Apply support staff detection to all routes
router.use(detectSupportStaff);

// Validation schemas
const createTicketSchema = insertSupportTicketSchema.pick({
  title: true,
  description: true,
  priority: true,
  categoryId: true,
}).extend({
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium")
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().optional()
});

const createMessageSchema = insertTicketMessageSchema.pick({
  message: true,
  isInternal: true
}).extend({
  is_internal: z.boolean().default(false)
});

const assignTicketSchema = z.object({
  assigned_to: z.string().uuid(),
  notes: z.string().optional()
});

const unassignTicketSchema = z.object({
  notes: z.string().optional()
});

const updateMessageSchema = z.object({
  message: z.string().min(1).trim()
});

const listTicketsSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigned_to: z.string().optional(),
  category_id: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

// Status transition validation
const VALID_STATUS_TRANSITIONS = {
  "open": ["in_progress", "resolved", "closed"],
  "in_progress": ["open", "resolved", "closed"], 
  "resolved": ["in_progress", "closed"],
  "closed": [] // Closed tickets cannot transition
};

function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === newStatus) return true;
  return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
}

/**
 * Static routes first to avoid parameter shadowing
 */

/**
 * GET /api/support-tickets/categories
 * Get all ticket categories
 */
router.get("/categories", requireAuth, async (_req, res) => {
  try {
    const categoriesResult = await db.execute(sql`
      SELECT * FROM ticket_categories WHERE is_active = true ORDER BY name ASC
    `);

    res.json({ categories: categoriesResult });
  } catch (error) {
    console.error("[TICKETS] Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/**
 * GET /api/support-tickets/stats
 * Get ticket statistics (support staff only)
 */
router.get("/stats", requireAuth, requireSupportStaff, async (_req, res) => {
  try {
    // Get ticket counts by status
    const statusStatsResult = await db.execute(sql`
      SELECT status, COUNT(*) as count 
      FROM support_tickets 
      GROUP BY status
    `);

    // Get ticket counts by priority
    const priorityStatsResult = await db.execute(sql`
      SELECT priority, COUNT(*) as count 
      FROM support_tickets 
      GROUP BY priority
    `);

    // Get unassigned ticket count
    const unassignedResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM support_tickets 
      WHERE assigned_to IS NULL
    `);

    // Get ticket counts by organization
    const orgStatsResult = await db.execute(sql`
      SELECT st.org_id, o.name as org_name, COUNT(*) as count
      FROM support_tickets st
      LEFT JOIN orgs o ON st.org_id = o.id
      GROUP BY st.org_id, o.name
      ORDER BY count DESC
    `);

    res.json({
      statusStats: statusStatsResult,
      priorityStats: priorityStatsResult,
      unassignedCount: unassignedResult[0]?.count || 0,
      orgStats: orgStatsResult
    });
  } catch (error) {
    console.error("[TICKETS] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * GET /api/support-tickets/staff
 * Get all support staff members for assignment (support staff only)
 */
router.get("/staff", requireAuth, requireSupportStaff, async (_req, res) => {
  try {
    const supportStaffResult = await db.execute(sql`
      SELECT id, name, email 
      FROM users 
      WHERE role = 'support_staff' 
      ORDER BY name ASC
    `);

    res.json({ staff: supportStaffResult });
  } catch (error) {
    console.error("[TICKETS] Error fetching support staff:", error);
    res.status(500).json({ error: "Failed to fetch support staff" });
  }
});

/**
 * GET /api/support-tickets/assignments/my
 * Get tickets assigned to current user (support staff only)
 */
router.get("/assignments/my", requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const ticketsResult = await db.execute(sql`
      SELECT 
        st.id, st.org_id, st.title, st.description, st.status, st.priority,
        st.category_id, st.submitted_by, st.assigned_to, st.resolved_at,
        st.created_at, st.updated_at,
        tc.name as category_name,
        u1.name as submitted_by_name, u1.email as submitted_by_email,
        o.name as org_name
      FROM support_tickets st
      LEFT JOIN ticket_categories tc ON st.category_id = tc.id
      LEFT JOIN users u1 ON st.submitted_by = u1.id
      LEFT JOIN orgs o ON st.org_id = o.id
      WHERE st.assigned_to = $1
      ORDER BY st.created_at DESC
    `, [userId]);

    console.log(`[TICKETS] Retrieved ${ticketsResult.length} assigned tickets for support staff ${userId}`);

    res.json({ tickets: ticketsResult });
  } catch (error) {
    console.error("[TICKETS] Error fetching assigned tickets:", error);
    res.status(500).json({ error: "Failed to fetch assigned tickets" });
  }
});

/**
 * Dynamic routes (with parameters)
 */

/**
 * GET /api/support-tickets
 * List support tickets based on user role:
 * - Support staff: Can see tickets from all organizations
 * - Regular users: Only see tickets from their organization
 */
router.get("/", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const validationResult = listTicketsSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid query parameters",
        details: validationResult.error.flatten()
      });
    }

    const { status, priority, assigned_to, category_id, page, limit } = validationResult.data;
    const offset = (Number(page) - 1) * Number(limit);

    // Build base query using SQL for better compatibility
    let baseQuery = sql`
      SELECT 
        st.id, st.org_id, st.title, st.description, st.status, st.priority,
        st.category_id, st.submitted_by, st.assigned_to, st.resolved_at,
        st.created_at, st.updated_at,
        tc.name as category_name,
        u1.name as submitted_by_name, u1.email as submitted_by_email,
        u2.name as assigned_to_name, u2.email as assigned_to_email,
        o.name as org_name
      FROM support_tickets st
      LEFT JOIN ticket_categories tc ON st.category_id = tc.id
      LEFT JOIN users u1 ON st.submitted_by = u1.id
      LEFT JOIN users u2 ON st.assigned_to = u2.id
      LEFT JOIN orgs o ON st.org_id = o.id
    `;

    let whereConditions = [];
    let queryParams: any[] = [];

    // Apply org filtering based on user role
    if (!req.isSupportStaff) {
      // Regular users can only see tickets from their org
      if (!req.orgId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      whereConditions.push(`st.org_id = $${queryParams.length + 1}`);
      queryParams.push(req.orgId);
    }
    // Support staff see all tickets (no org filter)

    // Apply additional filters
    if (status) {
      whereConditions.push(`st.status = $${queryParams.length + 1}`);
      queryParams.push(status);
    }
    if (priority) {
      whereConditions.push(`st.priority = $${queryParams.length + 1}`);
      queryParams.push(priority);
    }
    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        whereConditions.push(`st.assigned_to IS NULL`);
      } else {
        whereConditions.push(`st.assigned_to = $${queryParams.length + 1}`);
        queryParams.push(assigned_to);
      }
    }
    if (category_id) {
      whereConditions.push(`st.category_id = $${queryParams.length + 1}`);
      queryParams.push(category_id);
    }

    if (whereConditions.length > 0) {
      baseQuery = sql`${baseQuery} WHERE ${sql.raw(whereConditions.join(' AND '))}`;
    }

    baseQuery = sql`${baseQuery} ORDER BY st.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(Number(limit), offset);

    const tickets = await db.execute(sql`${baseQuery}`, queryParams);

    // Get total count for pagination
    let countQuery = sql`SELECT COUNT(*) as count FROM support_tickets st`;
    let countParams: any[] = [];

    if (!req.isSupportStaff && req.orgId) {
      countQuery = sql`${countQuery} WHERE st.org_id = $1`;
      countParams.push(req.orgId);
    }

    const countResult = await db.execute(countQuery, countParams);
    const totalCount = countResult[0]?.count || 0;

    console.log(`[TICKETS] Retrieved ${tickets.length} tickets for ${req.isSupportStaff ? 'support staff' : 'regular user'}`);

    res.json({
      tickets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error("[TICKETS] Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});


/**
 * POST /api/support-tickets
 * Create a new support ticket (customers only, support staff cannot create tickets for customers)
 */
router.post("/", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const validationResult = createTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { title, description, priority, categoryId } = validationResult.data;

    // Support staff cannot create tickets on behalf of customers
    if (req.isSupportStaff) {
      return res.status(403).json({ 
        error: "Support staff cannot create tickets for customers",
        message: "Tickets must be created by the customer organization"
      });
    }

    if (!req.orgId) {
      return res.status(400).json({ error: "Organization context required" });
    }

    // Verify category exists
    const categoryResult = await db.execute(sql`
      SELECT id, name FROM ticket_categories WHERE id = $1
    `, [categoryId]);

    if (!categoryResult[0]) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const userId = req.user?.id || req.session?.userId;

    const ticketResult = await db.execute(sql`
      INSERT INTO support_tickets (org_id, title, description, priority, category_id, submitted_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.orgId, title, description, priority, categoryId, userId]);

    const ticket = ticketResult[0];

    console.log(`[TICKETS] Created new ticket ${ticket.id} by user ${userId} in org ${req.orgId}`);

    res.status(201).json({ ticket });
  } catch (error) {
    console.error("[TICKETS] Error creating ticket:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

/**
 * GET /api/support-tickets/:id
 * Get single ticket details with full information
 */
router.get("/:id", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    // Build ticket query with org filtering
    let ticketQuery = sql`
      SELECT 
        st.id, st.org_id, st.title, st.description, st.status, st.priority,
        st.category_id, st.submitted_by, st.assigned_to, st.resolved_at,
        st.created_at, st.updated_at,
        tc.name as category_name, tc.description as category_description,
        u1.name as submitted_by_name, u1.email as submitted_by_email,
        u2.name as assigned_to_name, u2.email as assigned_to_email,
        o.name as org_name
      FROM support_tickets st
      LEFT JOIN ticket_categories tc ON st.category_id = tc.id
      LEFT JOIN users u1 ON st.submitted_by = u1.id
      LEFT JOIN users u2 ON st.assigned_to = u2.id
      LEFT JOIN orgs o ON st.org_id = o.id
      WHERE st.id = $1
    `;

    let ticketParams = [id];

    // Apply org filtering for non-support staff
    if (!req.isSupportStaff && req.orgId) {
      ticketQuery = sql`${ticketQuery} AND st.org_id = $2`;
      ticketParams.push(req.orgId);
    }

    const ticketResult = await db.execute(ticketQuery, ticketParams);
    const ticket = ticketResult[0];

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Get recent messages (last 10)
    let messagesQuery = sql`
      SELECT 
        tm.id, tm.ticket_id, tm.author_id, tm.message, tm.is_internal, tm.created_at,
        u.name as author_name, u.email as author_email, u.role as author_role
      FROM ticket_messages tm
      LEFT JOIN users u ON tm.author_id = u.id
      WHERE tm.ticket_id = $1
    `;

    let messagesParams = [id];

    // Filter internal messages for non-support staff
    if (!req.isSupportStaff) {
      messagesQuery = sql`${messagesQuery} AND tm.is_internal = false`;
    }

    messagesQuery = sql`${messagesQuery} ORDER BY tm.created_at DESC LIMIT 10`;

    const messages = await db.execute(messagesQuery, messagesParams);

    // Get assignment history
    const assignmentsResult = await db.execute(sql`
      SELECT 
        ta.id, ta.assigned_to, ta.assigned_by, ta.assigned_at, ta.unassigned_at,
        u1.name as assigned_to_name, u1.email as assigned_to_email,
        u2.name as assigned_by_name, u2.email as assigned_by_email
      FROM ticket_assignments ta
      LEFT JOIN users u1 ON ta.assigned_to = u1.id
      LEFT JOIN users u2 ON ta.assigned_by = u2.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.assigned_at DESC
    `, [id]);

    console.log(`[TICKETS] Retrieved ticket details ${id} by ${req.isSupportStaff ? 'support staff' : 'customer'} ${req.user?.id}`);

    res.json({
      ticket,
      messages: messages.reverse(), // Show oldest first
      assignments: assignmentsResult
    });
  } catch (error) {
    console.error("[TICKETS] Error fetching ticket details:", error);
    res.status(500).json({ error: "Failed to fetch ticket details" });
  }
});

/**
 * DELETE /api/support-tickets/:id
 * Delete ticket (admin only - requires 'admin' role)
 */
router.delete("/:id", requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    // Check for admin role (more restrictive than support staff)
    const user = req.user || { role: req.session?.role };
    if (user?.role !== 'admin' && user?.role !== 'support_staff') {
      return res.status(403).json({ error: "Admin privileges required to delete tickets" });
    }

    // Check if ticket exists
    const ticketResult = await db.execute(sql`
      SELECT id, title, org_id FROM support_tickets WHERE id = $1
    `, [id]);

    const ticket = ticketResult[0];
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Delete ticket (cascading deletes will handle messages and assignments)
    await db.execute(sql`
      DELETE FROM support_tickets WHERE id = $1
    `, [id]);

    console.log(`[TICKETS] Deleted ticket ${id} ("${ticket.title}") by admin ${req.user?.id}`);

    res.json({ 
      message: "Ticket deleted successfully",
      deletedTicket: {
        id: ticket.id,
        title: ticket.title,
        orgId: ticket.org_id
      }
    });
  } catch (error) {
    console.error("[TICKETS] Error deleting ticket:", error);
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

/**
 * PATCH /api/support-tickets/:id
 * Update ticket status, priority, or assignment (support staff can update any ticket)
 */
router.patch("/:id", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const validationResult = updateTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { status, priority, assigned_to, notes } = validationResult.data;

    // Get current ticket to verify permissions
    const currentTicketResult = await db.execute(sql`
      SELECT * FROM support_tickets WHERE id = $1
    `, [id]);

    const currentTicket = currentTicketResult[0];
    if (!currentTicket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Check permissions: support staff can update any ticket, customers can only update their org's tickets
    if (!req.isSupportStaff) {
      if (!req.orgId || currentTicket.org_id !== req.orgId) {
        return res.status(403).json({ error: "Access denied to this ticket" });
      }
      
      // Customers cannot change assignment or close tickets
      if (assigned_to !== undefined || status === 'closed') {
        return res.status(403).json({ error: "Only support staff can assign tickets or close them" });
      }
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status !== undefined) {
      // Validate status transition
      if (!validateStatusTransition(currentTicket.status, status)) {
        return res.status(400).json({ 
          error: "Invalid status transition",
          details: `Cannot change status from '${currentTicket.status}' to '${status}'`,
          validTransitions: VALID_STATUS_TRANSITIONS[currentTicket.status] || []
        });
      }

      updates.push(`status = $${paramIndex++}`);
      params.push(status);
      
      if (status === 'resolved' || status === 'closed') {
        updates.push(`resolved_at = now()`);
      }
    }
    
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    
    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramIndex++}`);
      params.push(assigned_to);
      
      // Create assignment record if assigning to someone
      if (assigned_to) {
        await db.execute(sql`
          INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by)
          VALUES ($1, $2, $3)
        `, [id, assigned_to, req.user?.id || req.session?.userId]);
      }
    }

    updates.push(`updated_at = now()`);
    params.push(id); // Add id for WHERE clause

    const updateQuery = sql.raw(`
      UPDATE support_tickets 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `);

    const updatedTicketResult = await db.execute(updateQuery, params);
    const updatedTicket = updatedTicketResult[0];

    // Add a system message about the update if there were significant changes
    if (status || assigned_to !== undefined) {
      let message = '';
      if (status) message += `Status changed to: ${status}. `;
      if (assigned_to) {
        const assigneeResult = await db.execute(sql`
          SELECT name FROM users WHERE id = $1
        `, [assigned_to]);
        message += `Assigned to: ${assigneeResult[0]?.name || 'Unknown'}. `;
      } else if (assigned_to === null) {
        message += 'Unassigned. ';
      }
      if (notes) message += `Notes: ${notes}`;

      if (message) {
        await db.execute(sql`
          INSERT INTO ticket_messages (ticket_id, author_id, message, is_internal)
          VALUES ($1, $2, $3, true)
        `, [id, req.user?.id || req.session?.userId, message.trim()]);
      }
    }

    console.log(`[TICKETS] Updated ticket ${id} by ${req.isSupportStaff ? 'support staff' : 'customer'} ${req.user?.id}`);

    res.json({ ticket: updatedTicket });
  } catch (error) {
    console.error("[TICKETS] Error updating ticket:", error);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

/**
 * POST /api/support-tickets/:id/messages
 * Add a message to a ticket
 */
router.post("/:id/messages", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const validationResult = createMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { message, is_internal } = validationResult.data;

    // Get current ticket to verify permissions
    const currentTicketResult = await db.execute(sql`
      SELECT * FROM support_tickets WHERE id = $1
    `, [id]);

    const currentTicket = currentTicketResult[0];
    if (!currentTicket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Check permissions
    if (!req.isSupportStaff && req.orgId && currentTicket.org_id !== req.orgId) {
      return res.status(403).json({ error: "Access denied to this ticket" });
    }

    // Only support staff can create internal messages
    const isInternal = req.isSupportStaff ? is_internal : false;

    const messageResult = await db.execute(sql`
      INSERT INTO ticket_messages (ticket_id, author_id, message, is_internal)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, req.user?.id || req.session?.userId, message.trim(), isInternal]);

    const newMessage = messageResult[0];

    // Update ticket's updated_at timestamp
    await db.execute(sql`
      UPDATE support_tickets SET updated_at = now() WHERE id = $1
    `, [id]);

    console.log(`[TICKETS] Added message to ticket ${id} by ${req.isSupportStaff ? 'support staff' : 'customer'} ${req.user?.id}`);

    res.status(201).json({ message: newMessage });
  } catch (error) {
    console.error("[TICKETS] Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

/**
 * GET /api/support-tickets/:id/messages
 * Get conversation history for a specific ticket
 */
router.get("/:id/messages", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const queryValidation = z.object({
      include_internal: z.enum(["true", "false"]).optional().default("false")
    }).safeParse(req.query);

    if (!queryValidation.success) {
      return res.status(400).json({ 
        error: "Invalid query parameters",
        details: queryValidation.error.flatten()
      });
    }

    const { include_internal } = queryValidation.data;

    // Get current ticket to verify permissions
    let ticketQuery = sql`
      SELECT id, org_id FROM support_tickets WHERE id = $1
    `;
    let ticketParams = [id];

    // Apply org filtering for non-support staff
    if (!req.isSupportStaff && req.orgId) {
      ticketQuery = sql`${ticketQuery} AND org_id = $2`;
      ticketParams.push(req.orgId);
    }

    const ticketResult = await db.execute(ticketQuery, ticketParams);
    const ticket = ticketResult[0];

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Build messages query - support staff can see internal messages, customers cannot
    let messagesQuery = sql`
      SELECT 
        tm.id, tm.ticket_id, tm.author_id, tm.message, tm.is_internal, tm.created_at,
        u.name as author_name, u.email as author_email, u.role as author_role
      FROM ticket_messages tm
      LEFT JOIN users u ON tm.author_id = u.id
      WHERE tm.ticket_id = $1
    `;

    let messagesParams = [id];

    // Filter internal messages for non-support staff
    if (!req.isSupportStaff) {
      messagesQuery = sql`${messagesQuery} AND tm.is_internal = false`;
    } else if (include_internal === 'false') {
      // Support staff can optionally exclude internal messages
      messagesQuery = sql`${messagesQuery} AND tm.is_internal = false`;
    }

    messagesQuery = sql`${messagesQuery} ORDER BY tm.created_at ASC`;

    const messages = await db.execute(messagesQuery, messagesParams);

    console.log(`[TICKETS] Retrieved ${messages.length} messages for ticket ${id} by ${req.isSupportStaff ? 'support staff' : 'customer'}`);

    res.json({ messages });
  } catch (error) {
    console.error("[TICKETS] Error fetching ticket messages:", error);
    res.status(500).json({ error: "Failed to fetch ticket messages" });
  }
});

/**
 * PATCH /api/support-tickets/:id/messages/:messageId
 * Edit a ticket message (author only, within 24 hours)
 */
router.patch("/:id/messages/:messageId", requireAuth, requireTicketAccess, async (req, res) => {
  try {
    const { id, messageId } = req.params;

    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(messageId).success) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const validationResult = updateMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { message } = validationResult.data;

    const userId = req.user?.id || req.session?.userId;

    // Get message and verify permissions
    const messageResult = await db.execute(sql`
      SELECT tm.*, st.org_id as ticket_org_id
      FROM ticket_messages tm
      JOIN support_tickets st ON tm.ticket_id = st.id
      WHERE tm.id = $1 AND tm.ticket_id = $2
    `, [messageId, id]);

    const currentMessage = messageResult[0];
    if (!currentMessage) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check ticket access permissions
    if (!req.isSupportStaff && req.orgId && currentMessage.ticket_org_id !== req.orgId) {
      return res.status(403).json({ error: "Access denied to this ticket" });
    }

    // Only the author can edit their own messages
    if (currentMessage.author_id !== userId) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    // Check if message is within 24-hour edit window
    const messageAge = Date.now() - new Date(currentMessage.created_at).getTime();
    const maxEditTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (messageAge > maxEditTime) {
      return res.status(403).json({ error: "Messages can only be edited within 24 hours of creation" });
    }

    // Update the message
    const updatedMessageResult = await db.execute(sql`
      UPDATE ticket_messages 
      SET message = $1
      WHERE id = $2
      RETURNING *
    `, [message.trim(), messageId]);

    const updatedMessage = updatedMessageResult[0];

    // Update ticket's updated_at timestamp
    await db.execute(sql`
      UPDATE support_tickets SET updated_at = now() WHERE id = $1
    `, [id]);

    console.log(`[TICKETS] Updated message ${messageId} in ticket ${id} by user ${userId}`);

    res.json({ message: updatedMessage });
  } catch (error) {
    console.error("[TICKETS] Error updating message:", error);
    res.status(500).json({ error: "Failed to update message" });
  }
});

/**
 * POST /api/support-tickets/:id/assign
 * Assign ticket to support staff member (support staff only)
 */
router.post("/:id/assign", requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const validationResult = assignTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { assigned_to, notes } = validationResult.data;

    // Verify the assignee is support staff
    const assigneeResult = await db.execute(sql`
      SELECT id, name, email, role FROM users WHERE id = $1
    `, [assigned_to]);

    const assignee = assigneeResult[0];
    if (!assignee) {
      return res.status(400).json({ error: "Assignee not found" });
    }

    if (assignee.role !== 'support_staff') {
      return res.status(400).json({ error: "Can only assign tickets to support staff members" });
    }

    // Check if ticket exists
    const ticketResult = await db.execute(sql`
      SELECT id, title, assigned_to, status FROM support_tickets WHERE id = $1
    `, [id]);

    const ticket = ticketResult[0];
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Update ticket assignment
    const updatedTicketResult = await db.execute(sql`
      UPDATE support_tickets 
      SET assigned_to = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `, [assigned_to, id]);

    const updatedTicket = updatedTicketResult[0];

    // Create assignment record
    await db.execute(sql`
      INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by)
      VALUES ($1, $2, $3)
    `, [id, assigned_to, req.user?.id || req.session?.userId]);

    // Add system message about assignment
    let systemMessage = `Assigned to: ${assignee.name}`;
    if (notes) systemMessage += `. Notes: ${notes}`;

    await db.execute(sql`
      INSERT INTO ticket_messages (ticket_id, author_id, message, is_internal)
      VALUES ($1, $2, $3, true)
    `, [id, req.user?.id || req.session?.userId, systemMessage]);

    console.log(`[TICKETS] Assigned ticket ${id} to ${assignee.name} by support staff ${req.user?.id}`);

    res.json({ 
      ticket: updatedTicket,
      assignee: {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email
      }
    });
  } catch (error) {
    console.error("[TICKETS] Error assigning ticket:", error);
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});

/**
 * DELETE /api/support-tickets/:id/assign
 * Unassign ticket (support staff only)
 */
router.delete("/:id/assign", requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const validationResult = unassignTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationResult.error.flatten()
      });
    }

    const { notes } = validationResult.data;

    // Check if ticket exists and is assigned
    const ticketResult = await db.execute(sql`
      SELECT id, title, assigned_to, status FROM support_tickets WHERE id = $1
    `, [id]);

    const ticket = ticketResult[0];
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (!ticket.assigned_to) {
      return res.status(400).json({ error: "Ticket is not currently assigned" });
    }

    // Get assignee name for the system message
    const assigneeResult = await db.execute(sql`
      SELECT name FROM users WHERE id = $1
    `, [ticket.assigned_to]);

    const assigneeName = assigneeResult[0]?.name || 'Unknown';

    // Unassign the ticket
    const updatedTicketResult = await db.execute(sql`
      UPDATE support_tickets 
      SET assigned_to = NULL, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id]);

    const updatedTicket = updatedTicketResult[0];

    // Mark assignment record as unassigned
    await db.execute(sql`
      UPDATE ticket_assignments 
      SET unassigned_at = now()
      WHERE ticket_id = $1 AND assigned_to = $2 AND unassigned_at IS NULL
    `, [id, ticket.assigned_to]);

    // Add system message about unassignment
    let systemMessage = `Unassigned from: ${assigneeName}`;
    if (notes) systemMessage += `. Notes: ${notes}`;

    await db.execute(sql`
      INSERT INTO ticket_messages (ticket_id, author_id, message, is_internal)
      VALUES ($1, $2, $3, true)
    `, [id, req.user?.id || req.session?.userId, systemMessage]);

    console.log(`[TICKETS] Unassigned ticket ${id} from ${assigneeName} by support staff ${req.user?.id}`);

    res.json({ 
      ticket: updatedTicket,
      message: "Ticket successfully unassigned"
    });
  } catch (error) {
    console.error("[TICKETS] Error unassigning ticket:", error);
    res.status(500).json({ error: "Failed to unassign ticket" });
  }
});

export default router;