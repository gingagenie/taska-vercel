import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, integer, decimal, boolean, jsonb, uuid, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Organizations - using 'orgs' table name for consistency
export const organizations = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  abn: varchar("abn", { length: 50 }),
  street: varchar("street", { length: 255 }),
  suburb: varchar("suburb", { length: 100 }),
  state: varchar("state", { length: 50 }),
  postcode: varchar("postcode", { length: 10 }),
  logoUrl: varchar("logo_url", { length: 500 }),
  defaultLabourRateCents: integer("default_labour_rate_cents").default(0),
  invoiceTerms: text("invoice_terms"),
  quoteTerms: text("quote_terms"),
  accountName: varchar("account_name", { length: 255 }),
  bsb: varchar("bsb", { length: 10 }),
  accountNumber: varchar("account_number", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Legacy organizations table reference (deprecated)
export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  role: varchar("role", { length: 100 }), // 'admin', 'member', 'support_staff'
  phone: varchar("phone", { length: 50 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  color: varchar("color", { length: 7 }).default("#3b82f6"), // Default blue
  createdAt: timestamp("created_at").defaultNow(),
});

// Memberships (user-org relationship)
export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  orgId: uuid("org_id").references(() => organizations.id),
  role: varchar("role", { length: 50 }).default("member"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Teams
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Team members
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid("team_id").references(() => teams.id),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Customers
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: text("contact_name"),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"), // Keep for backward compatibility
  street: text("street"),
  suburb: text("suburb"),
  state: text("state"),
  postcode: text("postcode"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Equipment
export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(), // FK reference removed - nuclear option like customers
  customerId: uuid("customer_id").references(() => customers.id),
  name: varchar("name", { length: 255 }).notNull(),
  make: varchar("make", { length: 255 }),
  model: varchar("model", { length: 255 }),
  serial: varchar("serial", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Jobs
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(), // FK reference removed - nuclear option
  customerId: uuid("customer_id").references(() => customers.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("new"),
  notes: text("notes"), // Work performed notes
  scheduledAt: timestamp("scheduled_at"),
  confirmationToken: varchar("confirmation_token", { length: 255 }).unique(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job assignments
export const jobAssignments = pgTable("job_assignments", {
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.jobId, t.userId] }),
}));

// Job equipment
export const jobEquipment = pgTable("job_equipment", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => jobs.id).notNull(),
  equipmentId: uuid("equipment_id").references(() => equipment.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Job photos
export const jobPhotos = pgTable("job_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  url: text("url").notNull(),
  objectKey: text("object_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Completed jobs - stores jobs that have been marked as completed
export const completedJobs = pgTable("completed_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  originalJobId: uuid("original_job_id").notNull(), // Reference to original job that was completed
  customerId: uuid("customer_id"),
  customerName: varchar("customer_name", { length: 255 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  notes: text("notes"), // Work performed notes
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  completedBy: uuid("completed_by").references(() => users.id),
  originalCreatedBy: uuid("original_created_by").references(() => users.id),
  originalCreatedAt: timestamp("original_created_at"),
});

// Job hours tracking (0.5 hour increments)
export const jobHours = pgTable("job_hours", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  hours: decimal("hours", { precision: 4, scale: 1 }).notNull(), // e.g., 1.5, 2.0, 0.5
  description: text("description"), // Optional description of work performed
  createdAt: timestamp("created_at").defaultNow(),
});

// Job parts used tracking  
export const jobParts = pgTable("job_parts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  partName: text("part_name").notNull(), // e.g., "Exhaust", "Air Filter"
  quantity: integer("quantity").notNull().default(1), // Whole numbers only
  createdAt: timestamp("created_at").defaultNow(),
});

// Completed job hours (preserved when job completed)
export const completedJobHours = pgTable("completed_job_hours", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  completedJobId: uuid("completed_job_id").notNull(),
  originalJobId: uuid("original_job_id").notNull(),
  orgId: uuid("org_id").notNull(),
  hours: decimal("hours", { precision: 4, scale: 1 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Completed job parts (preserved when job completed)
export const completedJobParts = pgTable("completed_job_parts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  completedJobId: uuid("completed_job_id").notNull(),
  originalJobId: uuid("original_job_id").notNull(),
  orgId: uuid("org_id").notNull(),
  partName: text("part_name").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Completed job equipment (preserved when job completed)
export const completedJobEquipment = pgTable("completed_job_equipment", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  completedJobId: uuid("completed_job_id").notNull(),
  originalJobId: uuid("original_job_id").notNull(),
  orgId: uuid("org_id").notNull(),
  equipmentId: uuid("equipment_id").notNull(), // Keep reference to original equipment
  equipmentName: varchar("equipment_name", { length: 255 }), // Snapshot of equipment name
  createdAt: timestamp("created_at").defaultNow(),
});

// Entitlements (for pro features)
export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull().unique(),
  plan: varchar("plan", { length: 50 }).default("free"),
  active: boolean("active").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quotes
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  jobId: uuid("job_id").references(() => jobs.id),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  items: jsonb("items").default([]),
  currency: varchar("currency", { length: 3 }).default("USD"),
  subTotal: decimal("sub_total", { precision: 10, scale: 2 }).default("0"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).default("0"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("draft"),
  confirmationToken: varchar("confirmation_token", { length: 255 }), // For email accept/decline links
  xeroId: varchar("xero_id", { length: 255 }), // Xero Quote ID
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoices
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  number: varchar("number", { length: 50 }), // Invoice number like inv-0001
  jobId: uuid("job_id"), // References original job ID (may be from completed job, not constrained)
  customerId: uuid("customer_id").references(() => customers.id),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  items: jsonb("items").default([]),
  currency: varchar("currency", { length: 3 }).default("USD"),
  subTotal: decimal("sub_total", { precision: 10, scale: 2 }).default("0"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).default("0"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("draft"),
  issuedAt: timestamp("issued_at"),
  dueAt: timestamp("due_at"),
  xeroId: varchar("xero_id", { length: 255 }), // Xero Invoice ID
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quote line items
export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitAmount: decimal("unit_amount", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoice line items
export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitAmount: decimal("unit_amount", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Job notifications for SMS logging and tracking
export const jobNotifications = pgTable("job_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  jobId: uuid("job_id").references(() => jobs.id),
  channel: varchar("channel", { length: 50 }).notNull(), // 'sms', 'email', etc.
  toAddr: varchar("to_addr", { length: 255 }).notNull(), // phone number or email
  body: text("body"),
  providerId: varchar("provider_id", { length: 255 }), // Twilio SID, etc.
  direction: varchar("direction", { length: 10 }).notNull(), // 'in' or 'out'
  status: varchar("status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization integrations (for Xero, QuickBooks, etc.)
export const orgIntegrations = pgTable("org_integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // 'xero', 'quickbooks', etc.
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  tenantId: varchar("tenant_id", { length: 255 }), // Xero tenant ID
  tenantName: varchar("tenant_name", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscription plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id", { length: 50 }).primaryKey(), // 'solo', 'pro', 'enterprise'
  name: varchar("name", { length: 100 }).notNull(),
  priceMonthly: integer("price_monthly").notNull(), // In cents
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  features: jsonb("features").default([]),
  smsQuotaMonthly: integer("sms_quota_monthly").default(0), // SMS limit per month
  emailsQuotaMonthly: integer("emails_quota_monthly").default(0), // Email limit per month
  usersQuota: integer("users_quota").default(1), // Maximum users allowed
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization subscriptions
export const orgSubscriptions = pgTable("org_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull().unique(),
  planId: varchar("plan_id", { length: 50 }).references(() => subscriptionPlans.id).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("trial"), // trial, active, past_due, canceled
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEnd: timestamp("trial_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// DEPRECATED: SMS usage tracking - use usage_counters instead
// This table is maintained for historical reference and migration purposes only
// DO NOT USE FOR NEW CODE - use usageCounters table with normalized period boundaries
export const smsUsage = pgTable("sms_usage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // Format: 'YYYY-MM' - DEPRECATED
  smsCount: integer("sms_count").default(0), // DEPRECATED: use usageCounters.smsSent
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Unique constraint on org + month combination
  orgMonthUnique: uniqueIndex("sms_usage_org_month_unique").on(
    t.orgId,
    t.month
  ),
}));

// Item presets (for billing line items)
export const itemPresets = pgTable("item_presets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unitAmount: decimal("unit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // ✅ composite unique on (org_id, name) - case sensitive for now
  orgNameUnique: uniqueIndex("item_presets_org_name_unique").on(
    t.orgId,
    t.name
  ),
}));

// Usage counters for tracking SMS, email, and user limits across subscription tiers
export const usageCounters = pgTable("usage_counters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(), // Aligned with org_subscriptions
  periodEnd: timestamp("period_end").notNull(),     // Aligned with org_subscriptions  
  smsSent: integer("sms_sent").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Unique constraint on org + period combination to prevent duplicate billing periods
  orgPeriodUnique: uniqueIndex("usage_counters_org_period_unique").on(
    t.orgId,
    t.periodStart,
    t.periodEnd
  ),
  // CHECK constraint for data integrity
  periodValidation: sql`CONSTRAINT usage_counters_period_valid CHECK (period_end > period_start)`,
}));

// Usage packs for SMS and email add-on purchases
export const usagePacks = pgTable("usage_packs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  packType: varchar("pack_type", { length: 10 }).notNull(), // 'sms' | 'email'
  quantity: integer("quantity").notNull(), // Total SMS/emails in the pack
  usedQuantity: integer("used_quantity").notNull().default(0), // How many have been consumed
  purchasedAt: timestamp("purchased_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // 6 months from purchase
  stripePaymentId: text("stripe_payment_id"), // For payment tracking
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'expired' | 'used_up'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Index for efficient lookups by org and status
  orgStatusIdx: index("usage_packs_org_status_idx").on(t.orgId, t.status),
  // Index for efficient expiry checks
  statusExpiryIdx: index("usage_packs_status_expiry_idx").on(t.status, t.expiresAt),
  // Check constraint for pack type validation
  packTypeValidation: sql`CONSTRAINT usage_packs_pack_type_valid CHECK (pack_type IN ('sms', 'email'))`,
  // Check constraint for status validation
  statusValidation: sql`CONSTRAINT usage_packs_status_valid CHECK (status IN ('active', 'expired', 'used_up'))`,
  // Check constraint for quantity validation
  quantityValidation: sql`CONSTRAINT usage_packs_quantity_valid CHECK (quantity > 0 AND used_quantity >= 0 AND used_quantity <= quantity)`,
}));

// CRITICAL: Durable pack reservations to prevent billing safety issues
// Replaces vulnerable in-memory reservation system
export const usagePackReservations = pgTable("usage_pack_reservations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  packId: uuid("pack_id").notNull().references(() => usagePacks.id, { onDelete: "cascade" }),
  packType: varchar("pack_type", { length: 10 }).notNull(), // 'sms' | 'email' for faster queries
  quantity: integer("quantity").notNull(), // Number of units reserved
  status: varchar("status", { length: 30 }).notNull().default("pending"), // 'pending' | 'finalized' | 'released' | 'compensation_required'
  expiresAt: timestamp("expires_at").notNull(), // 5 minute expiry for cleanup (extended on retries)
  // Enhanced retry state fields for continuous background processing
  attemptCount: integer("attempt_count").notNull().default(0), // Number of finalization attempts
  lastError: text("last_error"), // Last error message for debugging
  nextRetryAt: timestamp("next_retry_at"), // When to retry next (exponential backoff)
  compensationRequiredAt: timestamp("compensation_required_at"), // When marked for manual compensation
  originalExpiresAt: timestamp("original_expires_at").notNull(), // Original expiry time (before extensions)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Critical indexes for atomic operations and cleanup
  orgPackTypeIdx: index("reservations_org_pack_type_idx").on(t.orgId, t.packType, t.status),
  packStatusIdx: index("reservations_pack_status_idx").on(t.packId, t.status),
  statusExpiryIdx: index("reservations_status_expiry_idx").on(t.status, t.expiresAt),
  // Enhanced indexes for background processing
  nextRetryIdx: index("reservations_next_retry_idx").on(t.nextRetryAt, t.status),
  compensationIdx: index("reservations_compensation_idx").on(t.status, t.compensationRequiredAt),
  // Check constraints for data integrity
  packTypeValidation: sql`CONSTRAINT reservations_pack_type_valid CHECK (pack_type IN ('sms', 'email'))`,
  statusValidation: sql`CONSTRAINT reservations_status_valid CHECK (status IN ('pending', 'finalized', 'released', 'compensation_required'))`,
  quantityValidation: sql`CONSTRAINT reservations_quantity_valid CHECK (quantity > 0)`,
  attemptCountValidation: sql`CONSTRAINT reservations_attempt_count_valid CHECK (attempt_count >= 0)`,
}));

// Ticket categories for support system
export const ticketCategories = pgTable("ticket_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  autoAssignToRole: varchar("auto_assign_to_role", { length: 50 }), // 'support_staff', 'billing_team', etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Ensure category names are unique
  nameUnique: uniqueIndex("ticket_categories_name_unique").on(t.name),
}));

// Support tickets for customer support system
export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), // Customer org
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("open"), // 'open', 'in_progress', 'resolved', 'closed'
  priority: varchar("priority", { length: 20 }).notNull().default("medium"), // 'low', 'medium', 'high', 'urgent'
  categoryId: uuid("category_id").notNull().references(() => ticketCategories.id),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id), // Customer who submitted
  assignedTo: uuid("assigned_to").references(() => users.id), // Support staff assigned (nullable)
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Index for efficient lookups by org and status
  orgStatusIdx: index("support_tickets_org_status_idx").on(t.orgId, t.status),
  // Index for efficient lookups by assigned staff
  assignedToIdx: index("support_tickets_assigned_to_idx").on(t.assignedTo),
  // Index for efficient lookups by category
  categoryIdx: index("support_tickets_category_idx").on(t.categoryId),
  // Check constraints for data integrity
  statusValidation: sql`CONSTRAINT support_tickets_status_valid CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))`,
  priorityValidation: sql`CONSTRAINT support_tickets_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'urgent'))`,
}));

// Ticket messages for conversation threads
export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").default(false), // Internal notes vs customer-visible messages
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Index for efficient lookups by ticket
  ticketIdx: index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt),
  // Index for filtering internal vs external messages
  ticketInternalIdx: index("ticket_messages_ticket_internal_idx").on(t.ticketId, t.isInternal),
}));

// Ticket assignments for tracking support staff assignments
export const ticketAssignments = pgTable("ticket_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").notNull().references(() => users.id), // Support staff
  assignedBy: uuid("assigned_by").notNull().references(() => users.id), // Who made the assignment
  assignedAt: timestamp("assigned_at").defaultNow(),
  unassignedAt: timestamp("unassigned_at"),
}, (t) => ({
  // Index for efficient lookups by ticket
  ticketIdx: index("ticket_assignments_ticket_idx").on(t.ticketId, t.assignedAt),
  // Index for efficient lookups by assigned staff
  assignedToIdx: index("ticket_assignments_assigned_to_idx").on(t.assignedTo, t.assignedAt),
}));

// Notification preferences for users
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailNotifications: boolean("email_notifications").default(true),
  smsNotifications: boolean("sms_notifications").default(false),
  urgentSmsOnly: boolean("urgent_sms_only").default(true),
  businessHoursOnly: boolean("business_hours_only").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Unique constraint on user_id - one preference record per user
  userUnique: uniqueIndex("notification_preferences_user_unique").on(t.userId),
}));

// Notification history for audit trail
export const notificationHistory = pgTable("notification_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  type: varchar("type", { length: 10 }).notNull(), // 'email', 'sms'
  template: varchar("template", { length: 100 }).notNull(), // 'ticket_created', 'status_changed', etc.
  status: varchar("status", { length: 20 }).default("pending"), // 'sent', 'failed', 'bounced'
  reservationId: varchar("reservation_id", { length: 255 }), // Link to pack consumption
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientPhone: varchar("recipient_phone", { length: 50 }),
  subject: varchar("subject", { length: 500 }),
  messagePreview: text("message_preview"), // First 500 chars for debugging
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Indexes for efficient lookups
  ticketIdx: index("notification_history_ticket_idx").on(t.ticketId),
  userIdx: index("notification_history_user_idx").on(t.userId),
  orgIdx: index("notification_history_org_idx").on(t.orgId),
  statusTypeIdx: index("notification_history_status_type_idx").on(t.status, t.type),
  // Check constraints
  typeValidation: sql`CONSTRAINT notification_history_type_valid CHECK (type IN ('email', 'sms'))`,
  statusValidation: sql`CONSTRAINT notification_history_status_valid CHECK (status IN ('pending', 'sent', 'failed', 'bounced'))`,
}));

// ============================================================================
// SUPPORT PLATFORM ISOLATION - Completely separate from customer organizations
// ============================================================================

// Support users - completely isolated authentication system for support staff
export const supportUsers = pgTable("support_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull(), // 'support_agent' | 'support_admin'
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
}, (t) => ({
  // Check constraint for role validation
  roleValidation: sql`CONSTRAINT support_users_role_valid CHECK (role IN ('support_agent', 'support_admin'))`,
}));

// Support invites - invite-only user creation for support staff
export const supportInvites = pgTable("support_invites", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  invitedBy: uuid("invited_by").notNull().references(() => supportUsers.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Index for efficient lookups by email
  emailIdx: index("support_invites_email_idx").on(t.email),
  // Index for efficient cleanup of expired invites
  expiryIdx: index("support_invites_expiry_idx").on(t.expiresAt),
}));

// Support audit logs - comprehensive activity tracking for support staff
export const supportAuditLogs = pgTable("support_audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid("actor_id").notNull().references(() => supportUsers.id),
  action: varchar("action", { length: 100 }).notNull(), // 'login', 'ticket_view', 'ticket_reply', 'user_created', etc.
  target: varchar("target", { length: 255 }), // ticket_id, user_id, etc.
  meta: jsonb("meta"), // Additional context data
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Index for efficient lookups by actor
  actorIdx: index("support_audit_logs_actor_idx").on(t.actorId, t.createdAt),
  // Index for efficient lookups by action type
  actionIdx: index("support_audit_logs_action_idx").on(t.action, t.createdAt),
  // Index for efficient lookups by target
  targetIdx: index("support_audit_logs_target_idx").on(t.target),
}));

// Blog posts for marketing content management
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  authorId: uuid("author_id").references(() => users.id),
  authorName: varchar("author_name", { length: 120 }), // Denormalized for marketing flexibility
  category: varchar("category", { length: 60 }),
  tags: text("tags").array().default([]),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft', 'published', 'archived'
  coverImageUrl: varchar("cover_image_url", { length: 500 }),
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: varchar("meta_description", { length: 300 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Unique slug constraint for SEO-friendly URLs
  slugUnique: uniqueIndex("blog_posts_slug_unique").on(t.slug),
  // Index for published posts ordering
  statusPublishedIdx: index("blog_posts_status_published_idx").on(t.status, t.publishedAt),
  // Check constraint for status validation
  statusValidation: sql`CONSTRAINT blog_posts_status_valid CHECK (status IN ('draft', 'published', 'archived'))`,
}));

// Create insert schemas
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobPhotoSchema = createInsertSchema(jobPhotos).omit({ id: true, createdAt: true });
export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true });
export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertJobNotificationSchema = createInsertSchema(jobNotifications).omit({ id: true, createdAt: true });
export const insertOrgIntegrationSchema = createInsertSchema(orgIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItemPresetSchema = createInsertSchema(itemPresets).omit({ id: true, createdAt: true });
export const insertUsageCountersSchema = createInsertSchema(usageCounters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUsagePackSchema = createInsertSchema(usagePacks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUsagePackReservationSchema = createInsertSchema(usagePackReservations).omit({ id: true, createdAt: true });
export const insertCompletedJobSchema = createInsertSchema(completedJobs).omit({ id: true, completedAt: true });
export const insertJobHoursSchema = createInsertSchema(jobHours).omit({ id: true, createdAt: true });
export const insertJobPartsSchema = createInsertSchema(jobParts).omit({ id: true, createdAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ createdAt: true });
export const insertOrgSubscriptionSchema = createInsertSchema(orgSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSmsUsageSchema = createInsertSchema(smsUsage).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketCategorySchema = createInsertSchema(ticketCategories).omit({ id: true, createdAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export const insertTicketAssignmentSchema = createInsertSchema(ticketAssignments).omit({ id: true, assignedAt: true });
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationHistorySchema = createInsertSchema(notificationHistory).omit({ id: true, createdAt: true });
export const insertSupportUserSchema = createInsertSchema(supportUsers).omit({ id: true, createdAt: true });
export const insertSupportInviteSchema = createInsertSchema(supportInvites).omit({ id: true, createdAt: true });
export const insertSupportAuditLogSchema = createInsertSchema(supportAuditLogs).omit({ id: true, createdAt: true });
export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  // Add validation for slug generation - allow empty slug to be auto-generated
  slug: z.string().min(1).max(150).optional(),
});

// Create types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type JobPhoto = typeof jobPhotos.$inferSelect;
export type InsertJobPhoto = z.infer<typeof insertJobPhotoSchema>;

export type JobNotification = typeof jobNotifications.$inferSelect;
export type InsertJobNotification = z.infer<typeof insertJobNotificationSchema>;

export type OrgIntegration = typeof orgIntegrations.$inferSelect;
export type InsertOrgIntegration = z.infer<typeof insertOrgIntegrationSchema>;

export type ItemPreset = typeof itemPresets.$inferSelect;
export type InsertItemPreset = z.infer<typeof insertItemPresetSchema>;

export type UsageCounters = typeof usageCounters.$inferSelect;
export type InsertUsageCounters = z.infer<typeof insertUsageCountersSchema>;

export type UsagePack = typeof usagePacks.$inferSelect;
export type UsagePackReservation = typeof usagePackReservations.$inferSelect;
export type InsertUsagePackReservation = z.infer<typeof insertUsagePackReservationSchema>;
export type InsertUsagePack = z.infer<typeof insertUsagePackSchema>;

export type CompletedJob = typeof completedJobs.$inferSelect;
export type InsertCompletedJob = z.infer<typeof insertCompletedJobSchema>;

export type JobHours = typeof jobHours.$inferSelect;
export type InsertJobHours = z.infer<typeof insertJobHoursSchema>;

export type JobParts = typeof jobParts.$inferSelect;
export type InsertJobParts = z.infer<typeof insertJobPartsSchema>;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type OrgSubscription = typeof orgSubscriptions.$inferSelect;
export type InsertOrgSubscription = z.infer<typeof insertOrgSubscriptionSchema>;

export type SmsUsage = typeof smsUsage.$inferSelect;
export type InsertSmsUsage = z.infer<typeof insertSmsUsageSchema>;

export type TicketCategory = typeof ticketCategories.$inferSelect;
export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;

export type TicketAssignment = typeof ticketAssignments.$inferSelect;
export type InsertTicketAssignment = z.infer<typeof insertTicketAssignmentSchema>;

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = z.infer<typeof insertNotificationHistorySchema>;

export type SupportUser = typeof supportUsers.$inferSelect;
export type InsertSupportUser = z.infer<typeof insertSupportUserSchema>;

export type SupportInvite = typeof supportInvites.$inferSelect;
export type InsertSupportInvite = z.infer<typeof insertSupportInviteSchema>;

// Session storage table for connect-pg-simple (regular user sessions)
export const sessions = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
}, (t) => ({
  // Index for efficient cleanup of expired sessions
  expireIdx: index("session_expire_idx").on(t.expire),
}));

// Support session storage table for connect-pg-simple (support staff sessions)
export const supportSessions = pgTable("support_session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
}, (t) => ({
  // Index for efficient cleanup of expired sessions
  expireIdx: index("support_session_expire_idx").on(t.expire),
}));

export type SupportAuditLog = typeof supportAuditLogs.$inferSelect;
export type InsertSupportAuditLog = z.infer<typeof insertSupportAuditLogSchema>;

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;

// Stripe webhook monitoring - tracks webhook health and delivery status
export const stripeWebhookMonitoring = pgTable("stripe_webhook_monitoring", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lastSuccessfulWebhook: timestamp("last_successful_webhook"),
  lastWebhookEventId: varchar("last_webhook_event_id", { length: 255 }),
  consecutiveFailures: integer("consecutive_failures").default(0),
  lastFailureTimestamp: timestamp("last_failure_timestamp"),
  lastFailureReason: text("last_failure_reason"),
  totalWebhooksReceived: integer("total_webhooks_received").default(0),
  totalWebhooksFailed: integer("total_webhooks_failed").default(0),
  alertSentAt: timestamp("alert_sent_at"), // Track when we last sent an alert email
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Newsletter subscribers - for marketing emails and blog updates
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  emailLower: varchar("email_lower", { length: 255 }).notNull(), // Lowercased email for case-insensitive uniqueness
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active', 'unsubscribed'
  source: varchar("source", { length: 50 }).default("blog"), // 'blog', 'landing', 'popup'
  confirmationToken: varchar("confirmation_token", { length: 255 }), // For double opt-in
  unsubscribeToken: varchar("unsubscribe_token", { length: 255 }), // For secure unsubscribe links
  confirmedAt: timestamp("confirmed_at"),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Unique index on lowercased email to prevent duplicates
  emailLowerUnique: uniqueIndex("newsletter_subscribers_email_lower_unique").on(t.emailLower),
  // Index for efficient lookups by status
  statusIdx: index("newsletter_subscribers_status_idx").on(t.status),
  // Index for unsubscribe token lookups
  unsubscribeTokenIdx: index("newsletter_subscribers_unsubscribe_token_idx").on(t.unsubscribeToken),
  // Check constraint for status validation
  statusValidation: sql`CONSTRAINT newsletter_subscribers_status_valid CHECK (status IN ('active', 'unsubscribed'))`,
}));

// Newsletter subscriber Zod schemas
export const insertNewsletterSubscriberSchema = createInsertSchema(newsletterSubscribers, {
  email: z.string().email("Please enter a valid email address"),
}).omit({
  id: true,
  emailLower: true, // Omit as it's derived from email
  unsubscribeToken: true, // Omit as it's generated by the server
  confirmedAt: true, // Omit as it's set by the server
  unsubscribedAt: true, // Omit as it's set by the server
  createdAt: true,
  updatedAt: true,
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = z.infer<typeof insertNewsletterSubscriberSchema>;

export type StripeWebhookMonitoring = typeof stripeWebhookMonitoring.$inferSelect;

// Media - tracks photos stored in Supabase Storage
export const media = pgTable("media", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  jobId: uuid("job_id"), // Links to either jobs.id or completed_jobs.original_job_id
  key: text("key").notNull(), // Supabase Storage key: org/{orgId}/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}
  kind: varchar("kind", { length: 50 }).default("photo"),
  ext: varchar("ext", { length: 10 }),
  bytes: integer("bytes"),
  width: integer("width"),
  height: integer("height"),
  sha256: varchar("sha256", { length: 64 }),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => ({
  // Unique constraint on org + key
  orgKeyUnique: uniqueIndex("media_org_key_unique").on(t.orgId, t.key),
  // Index for efficient job photo lookups
  orgJobIdx: index("media_org_job_idx").on(t.orgId, t.jobId),
}));

export const insertMediaSchema = createInsertSchema(media).omit({
  id: true,
  createdAt: true,
});

export type Media = typeof media.$inferSelect;
export type InsertMedia = z.infer<typeof insertMediaSchema>;