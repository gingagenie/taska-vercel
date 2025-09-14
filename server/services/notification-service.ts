import { db } from "../db/client";
import { eq, and, sql } from "drizzle-orm";
import { users, organizations, supportTickets, notificationPreferences, notificationHistory } from "../../shared/schema";
import { checkSmsQuota, checkEmailQuota } from "../routes/job-sms";
import { reservePackUnits, finalizePackConsumption, releasePackReservation } from "../lib/pack-consumption";
import { sendEmail } from "./email";
import twilio from "twilio";

// Types for notification data
export interface NotificationData {
  ticketId: string;
  ticketTitle: string;
  customerName: string;
  orgName: string;
  priority: string;
  status?: string;
  oldStatus?: string;
  assigneeName?: string;
  message?: string;
  messageAuthor?: string;
  supportUrl?: string;
}

export interface NotificationResult {
  success: boolean;
  type: 'email' | 'sms';
  error?: string;
  notificationId?: string;
}

// Business hours configuration (Australian Eastern Time)
const BUSINESS_HOURS = {
  startHour: 8,  // 8 AM
  endHour: 18,   // 6 PM  
  timezone: process.env.BIZ_TZ || "Australia/Melbourne"
};

// Twilio configuration (reusing from job-sms.ts)
const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const twilioClient = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

/**
 * Core notification service for support ticket notifications
 * Leverages existing Twilio SMS infrastructure and pack consumption system
 */
export class NotificationService {
  /**
   * Check if current time is within business hours
   */
  private isBusinessHours(): boolean {
    try {
      const now = new Date();
      const localTime = new Date(now.toLocaleString("en-US", { timeZone: BUSINESS_HOURS.timezone }));
      const hour = localTime.getHours();
      const day = localTime.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Check if it's a weekday (Monday-Friday)
      const isWeekday = day >= 1 && day <= 5;
      // Check if it's within business hours
      const isBusinessTime = hour >= BUSINESS_HOURS.startHour && hour < BUSINESS_HOURS.endHour;
      
      return isWeekday && isBusinessTime;
    } catch (error) {
      console.error('[NOTIFICATIONS] Error checking business hours:', error);
      return true; // Default to allowing notifications
    }
  }

  /**
   * Get user's notification preferences
   */
  private async getUserPreferences(userId: string) {
    const [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    // Return default preferences if none exist
    return preferences || {
      emailNotifications: true,
      smsNotifications: false,
      urgentSmsOnly: true,
      businessHoursOnly: true
    };
  }

  /**
   * Format phone number for Australian mobile (reusing from job-sms.ts)
   */
  private formatAustralianPhone(phone: string): string {
    if (!phone) return '';
    
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Handle Australian mobile numbers
    if (cleaned.startsWith('04') && cleaned.length === 10) {
      return `+61${cleaned.substring(1)}`;
    }
    
    // Handle international format
    if (cleaned.startsWith('614') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    
    // Return as-is if we can't format it
    return phone;
  }

  /**
   * Create notification history record
   */
  private async createNotificationHistory(data: {
    ticketId: string;
    userId: string;
    orgId: string;
    type: 'email' | 'sms';
    template: string;
    status: 'pending' | 'sent' | 'failed';
    reservationId?: string;
    recipientEmail?: string;
    recipientPhone?: string;
    subject?: string;
    messagePreview?: string;
    errorMessage?: string;
  }): Promise<string> {
    const [record] = await db
      .insert(notificationHistory)
      .values({
        ...data,
        sentAt: data.status === 'sent' ? new Date() : null,
      })
      .returning({ id: notificationHistory.id });

    return record.id;
  }

  /**
   * Update notification history status
   */
  private async updateNotificationHistory(
    notificationId: string,
    status: 'sent' | 'failed' | 'bounced',
    errorMessage?: string
  ) {
    await db
      .update(notificationHistory)
      .set({
        status,
        sentAt: status === 'sent' ? new Date() : undefined,
        errorMessage: errorMessage || undefined,
      })
      .where(eq(notificationHistory.id, notificationId));
  }

  /**
   * Send SMS notification using existing Twilio infrastructure
   */
  public async sendSmsNotification(
    userId: string,
    orgId: string,
    template: string,
    message: string,
    data: NotificationData
  ): Promise<NotificationResult> {
    if (!twilioClient) {
      console.error('[NOTIFICATIONS] Twilio not configured');
      return { success: false, type: 'sms', error: 'SMS service not configured' };
    }

    let notificationId: string | null = null;
    let reservationId: string | null = null;

    try {
      // Get user details
      const [user] = await db
        .select({
          phone: users.phone,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.phone) {
        return { success: false, type: 'sms', error: 'User has no phone number' };
      }

      const formattedPhone = this.formatAustralianPhone(user.phone);
      if (!formattedPhone.startsWith('+61')) {
        return { success: false, type: 'sms', error: 'Invalid Australian phone number' };
      }

      // Check SMS quota and reserve pack if needed
      const quotaCheck = await checkSmsQuota(orgId);
      if (!quotaCheck.canSend) {
        const error = quotaCheck.error === 'no_packs' ? 'SMS quota exceeded' : 'Quota check failed';
        return { success: false, type: 'sms', error };
      }

      // Store reservation ID for cleanup on error
      reservationId = quotaCheck.reservationId;

      // Create notification history record
      notificationId = await this.createNotificationHistory({
        ticketId: data.ticketId,
        userId,
        orgId,
        type: 'sms',
        template,
        status: 'pending',
        reservationId: quotaCheck.reservationId,
        recipientPhone: formattedPhone,
        messagePreview: message.substring(0, 500),
      });

      // Send SMS
      const messagingService = messagingServiceSid 
        ? { messagingServiceSid } 
        : { from: fromNumber };

      const twilioMessage = await twilioClient.messages.create({
        to: formattedPhone,
        body: message,
        ...messagingService,
      });

      // Finalize pack consumption if reservation was made
      if (quotaCheck.reservationId) {
        const finalizationResult = await finalizePackConsumption(quotaCheck.reservationId);
        if (!finalizationResult.success) {
          console.error(`[NOTIFICATIONS] Pack finalization failed for SMS ${twilioMessage.sid}:`, finalizationResult.error);
          // Note: SMS was sent, so we don't return error here
        }
        // Clear reservation ID since it's been finalized
        reservationId = null;
      }

      // Update notification history
      await this.updateNotificationHistory(notificationId, 'sent');

      console.log(`[NOTIFICATIONS] SMS sent successfully to ${formattedPhone} for ticket ${data.ticketId}`);
      return { success: true, type: 'sms', notificationId };

    } catch (error) {
      console.error('[NOTIFICATIONS] SMS send error:', error);
      
      // CRITICAL FIX: Release pack reservation using correct reservationId
      if (reservationId) {
        try {
          await releasePackReservation(reservationId);
          console.log(`[NOTIFICATIONS] Released pack reservation ${reservationId} after SMS failure`);
        } catch (releaseError) {
          console.error(`[NOTIFICATIONS] Failed to release pack reservation ${reservationId}:`, releaseError);
        }
      }

      // Update notification history to failed status
      if (notificationId) {
        try {
          await this.updateNotificationHistory(notificationId, 'failed', error instanceof Error ? error.message : 'SMS send failed');
        } catch (updateError) {
          console.error('[NOTIFICATIONS] Failed to update notification history:', updateError);
        }
      }

      return { success: false, type: 'sms', error: error instanceof Error ? error.message : 'SMS send failed' };
    }
  }

  /**
   * Send email notification with pack consumption
   */
  public async sendEmailNotification(
    userId: string,
    orgId: string,
    template: string,
    subject: string,
    htmlContent: string,
    textContent: string,
    data: NotificationData
  ): Promise<NotificationResult> {
    let notificationId: string | null = null;
    let reservationId: string | null = null;

    try {
      // Get user details
      const [user] = await db
        .select({
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.email) {
        return { success: false, type: 'email', error: 'User has no email address' };
      }

      // Get organization details for FROM address
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId));

      const fromEmail = `support@taska.com.au`;
      const fromName = `${org?.name || 'Taska'} Support`;

      // Check email quota and reserve pack if needed
      const quotaCheck = await checkEmailQuota(orgId);
      if (!quotaCheck.canSend) {
        const error = quotaCheck.error === 'no_packs' ? 'Email quota exceeded' : 'Quota check failed';
        return { success: false, type: 'email', error };
      }

      // Store reservation ID for cleanup on error
      reservationId = quotaCheck.reservationId;

      // Create notification history record
      notificationId = await this.createNotificationHistory({
        ticketId: data.ticketId,
        userId,
        orgId,
        type: 'email',
        template,
        status: 'pending',
        reservationId: quotaCheck.reservationId,
        recipientEmail: user.email,
        subject,
        messagePreview: textContent.substring(0, 500),
      });

      // Send email using existing email service
      const emailSent = await sendEmail({
        to: user.email,
        from: `${fromName} <${fromEmail}>`,
        subject,
        html: htmlContent,
        text: textContent,
      });

      if (!emailSent) {
        // Release pack reservation
        if (quotaCheck.reservationId) {
          await releasePackReservation(quotaCheck.reservationId);
        }
        await this.updateNotificationHistory(notificationId, 'failed', 'Email send failed');
        return { success: false, type: 'email', error: 'Email send failed' };
      }

      // Finalize pack consumption if reservation was made
      if (quotaCheck.reservationId) {
        const finalizationResult = await finalizePackConsumption(quotaCheck.reservationId);
        if (!finalizationResult.success) {
          console.error(`[NOTIFICATIONS] Pack finalization failed for email to ${user.email}:`, finalizationResult.error);
          // Note: Email was sent, so we don't return error here
        }
        // Clear reservation ID since it's been finalized
        reservationId = null;
      }

      // Update notification history
      await this.updateNotificationHistory(notificationId, 'sent');

      console.log(`[NOTIFICATIONS] Email sent successfully to ${user.email} for ticket ${data.ticketId}`);
      return { success: true, type: 'email', notificationId };

    } catch (error) {
      console.error('[NOTIFICATIONS] Email send error:', error);
      
      // CRITICAL FIX: Release pack reservation using correct reservationId
      if (reservationId) {
        try {
          await releasePackReservation(reservationId);
          console.log(`[NOTIFICATIONS] Released pack reservation ${reservationId} after email failure`);
        } catch (releaseError) {
          console.error(`[NOTIFICATIONS] Failed to release pack reservation ${reservationId}:`, releaseError);
        }
      }

      // Update notification history to failed status
      if (notificationId) {
        try {
          await this.updateNotificationHistory(notificationId, 'failed', error instanceof Error ? error.message : 'Email send failed');
        } catch (updateError) {
          console.error('[NOTIFICATIONS] Failed to update notification history:', updateError);
        }
      }

      return { success: false, type: 'email', error: error instanceof Error ? error.message : 'Email send failed' };
    }
  }

  /**
   * Send notification to user based on their preferences
   */
  public async sendNotification(
    userId: string,
    orgId: string,
    template: string,
    smsMessage: string,
    emailSubject: string,
    emailHtml: string,
    emailText: string,
    data: NotificationData,
    isUrgent: boolean = false
  ): Promise<NotificationResult[]> {
    const preferences = await this.getUserPreferences(userId);
    const results: NotificationResult[] = [];

    // Check business hours restriction
    const isBusinessTime = this.isBusinessHours();
    const shouldRespectBusinessHours = preferences.businessHoursOnly && !isUrgent;
    
    if (shouldRespectBusinessHours && !isBusinessTime) {
      console.log(`[NOTIFICATIONS] Skipping notification for ${userId} - outside business hours`);
      return results;
    }

    // Send SMS if enabled - CRITICAL: Enforce urgentSmsOnly preference
    const shouldSendSms = preferences.smsNotifications && (!preferences.urgentSmsOnly || isUrgent);
    if (shouldSendSms) {
      console.log(`[NOTIFICATIONS] Sending SMS to ${userId} - urgent: ${isUrgent}, urgentSmsOnly: ${preferences.urgentSmsOnly}`);
      const smsResult = await this.sendSmsNotification(userId, orgId, template, smsMessage, data);
      results.push(smsResult);
    } else if (preferences.smsNotifications && preferences.urgentSmsOnly && !isUrgent) {
      console.log(`[NOTIFICATIONS] Skipping SMS for ${userId} - non-urgent with urgentSmsOnly preference enabled`);
    }

    // Send email if enabled
    if (preferences.emailNotifications) {
      const emailResult = await this.sendEmailNotification(
        userId, orgId, template, emailSubject, emailHtml, emailText, data
      );
      results.push(emailResult);
    }

    return results;
  }

  /**
   * Notify when ticket status changes
   */
  public async notifyStatusChanged(
    ticketId: string,
    customerId: string,
    oldStatus: string,
    newStatus: string,
    assignedStaffId?: string
  ): Promise<NotificationResult[]> {
    try {
      // Get ticket and related data
      const [ticketData] = await db.execute(sql`
        SELECT 
          st.id, st.title, st.description, st.priority, st.org_id,
          o.name as org_name,
          c.name as customer_name, c.email as customer_email,
          u.name as assignee_name
        FROM support_tickets st
        JOIN orgs o ON st.org_id = o.id
        LEFT JOIN users c ON st.submitted_by = c.id
        LEFT JOIN users u ON st.assigned_to = u.id
        WHERE st.id = ${ticketId}
      `);

      if (!ticketData) {
        throw new Error('Ticket not found');
      }

      const data: NotificationData = {
        ticketId,
        ticketTitle: ticketData.title,
        customerName: ticketData.customer_name || 'Unknown Customer',
        orgName: ticketData.org_name,
        priority: ticketData.priority,
        status: newStatus,
        oldStatus: oldStatus,
        assigneeName: ticketData.assignee_name,
        supportUrl: `${process.env.APP_URL || 'https://app.taska.com.au'}/support/tickets/${ticketId}`
      };

      const isUrgent = ticketData.priority === 'urgent' || newStatus === 'resolved';
      const allResults: NotificationResult[] = [];

      // Notify customer
      const customerSms = this.generateStatusChangeSms(data, oldStatus, newStatus, true);
      const customerEmailSubject = `Ticket Status Update: ${ticketData.title}`;
      const customerEmailHtml = this.generateStatusChangeEmailHtml(data, oldStatus, newStatus, true);
      const customerEmailText = this.generateStatusChangeEmailText(data, oldStatus, newStatus, true);

      const customerResults = await this.sendNotification(
        customerId, ticketData.org_id, 'status_changed_customer',
        customerSms, customerEmailSubject, customerEmailHtml, customerEmailText, data, isUrgent
      );
      allResults.push(...customerResults);

      // Notify assigned staff if different from customer
      if (assignedStaffId && assignedStaffId !== customerId) {
        const staffSms = this.generateStatusChangeSms(data, oldStatus, newStatus, false);
        const staffEmailSubject = `[${data.customerName}] Ticket Status: ${newStatus.toUpperCase()}`;
        const staffEmailHtml = this.generateStatusChangeEmailHtml(data, oldStatus, newStatus, false);
        const staffEmailText = this.generateStatusChangeEmailText(data, oldStatus, newStatus, false);

        const staffResults = await this.sendNotification(
          assignedStaffId, ticketData.org_id, 'status_changed_staff',
          staffSms, staffEmailSubject, staffEmailHtml, staffEmailText, data, isUrgent
        );
        allResults.push(...staffResults);
      }

      return allResults;

    } catch (error) {
      console.error('[NOTIFICATIONS] Error in notifyStatusChanged:', error);
      return [{ success: false, type: 'email', error: error instanceof Error ? error.message : 'Unknown error' }];
    }
  }

  /**
   * Notify when a new message is added to a ticket
   */
  public async notifyNewMessage(
    ticketId: string,
    authorId: string,
    messageContent: string,
    isInternal: boolean = false
  ): Promise<NotificationResult[]> {
    try {
      // Get ticket, message author, and related data
      const [ticketData] = await db.execute(sql`
        SELECT 
          st.id, st.title, st.priority, st.org_id, st.submitted_by, st.assigned_to,
          o.name as org_name,
          customer.name as customer_name,
          author.name as author_name, author.role as author_role,
          staff.name as staff_name
        FROM support_tickets st
        JOIN orgs o ON st.org_id = o.id
        LEFT JOIN users customer ON st.submitted_by = customer.id
        LEFT JOIN users author ON ${authorId}::uuid = author.id
        LEFT JOIN users staff ON st.assigned_to = staff.id
        WHERE st.id = ${ticketId}
      `);

      if (!ticketData) {
        throw new Error('Ticket not found');
      }

      const data: NotificationData = {
        ticketId,
        ticketTitle: ticketData.title,
        customerName: ticketData.customer_name || 'Unknown Customer',
        orgName: ticketData.org_name,
        priority: ticketData.priority,
        message: messageContent,
        messageAuthor: ticketData.author_name || 'Unknown User',
        supportUrl: `${process.env.APP_URL || 'https://app.taska.com.au'}/support/tickets/${ticketId}`
      };

      const isUrgent = ticketData.priority === 'urgent';
      const allResults: NotificationResult[] = [];

      // Don't send notifications for internal messages to customers
      if (!isInternal) {
        // If author is support staff, notify customer
        if (ticketData.author_role === 'support_staff' && ticketData.submitted_by !== authorId) {
          const customerSms = `New reply to ticket #${ticketId.slice(-6)} from ${data.orgName} support. Check: ${data.supportUrl}`;
          const customerEmailSubject = `New Reply: ${ticketData.title}`;
          const customerEmailHtml = this.generateNewMessageEmailHtml(data, true);
          const customerEmailText = this.generateNewMessageEmailText(data, true);

          const customerResults = await this.sendNotification(
            ticketData.submitted_by, ticketData.org_id, 'new_message_customer',
            customerSms, customerEmailSubject, customerEmailHtml, customerEmailText, data, false
          );
          allResults.push(...customerResults);
        }

        // If author is customer, notify assigned staff
        if (ticketData.author_role !== 'support_staff' && ticketData.assigned_to && ticketData.assigned_to !== authorId) {
          const staffSms = isUrgent 
            ? `URGENT: Reply from ${data.customerName} on ticket #${ticketId.slice(-6)}`
            : `Customer reply on ticket #${ticketId.slice(-6)}. Check support portal.`;
            
          const staffEmailSubject = `${isUrgent ? '[URGENT] ' : ''}Customer Reply: ${ticketData.title}`;
          const staffEmailHtml = this.generateNewMessageEmailHtml(data, false);
          const staffEmailText = this.generateNewMessageEmailText(data, false);

          const staffResults = await this.sendNotification(
            ticketData.assigned_to, ticketData.org_id, 'new_message_staff',
            staffSms, staffEmailSubject, staffEmailHtml, staffEmailText, data, isUrgent
          );
          allResults.push(...staffResults);
        }
      }

      return allResults;

    } catch (error) {
      console.error('[NOTIFICATIONS] Error in notifyNewMessage:', error);
      return [{ success: false, type: 'email', error: error instanceof Error ? error.message : 'Unknown error' }];
    }
  }

  /**
   * Notify when a ticket is assigned to support staff
   */
  public async notifyTicketAssigned(
    ticketId: string,
    assignedToId: string,
    assignedById: string
  ): Promise<NotificationResult[]> {
    try {
      // Get ticket and assignment data
      const [ticketData] = await db.execute(sql`
        SELECT 
          st.id, st.title, st.description, st.priority, st.org_id,
          o.name as org_name,
          customer.name as customer_name,
          assignee.name as assignee_name,
          assigner.name as assigner_name
        FROM support_tickets st
        JOIN orgs o ON st.org_id = o.id
        LEFT JOIN users customer ON st.submitted_by = customer.id
        LEFT JOIN users assignee ON ${assignedToId}::uuid = assignee.id
        LEFT JOIN users assigner ON ${assignedById}::uuid = assigner.id
        WHERE st.id = ${ticketId}
      `);

      if (!ticketData) {
        throw new Error('Ticket not found');
      }

      const data: NotificationData = {
        ticketId,
        ticketTitle: ticketData.title,
        customerName: ticketData.customer_name || 'Unknown Customer',
        orgName: ticketData.org_name,
        priority: ticketData.priority,
        assigneeName: ticketData.assignee_name || 'Unknown Staff',
        supportUrl: `${process.env.APP_URL || 'https://app.taska.com.au'}/support/tickets/${ticketId}`
      };

      const isUrgent = ticketData.priority === 'urgent';
      const allResults: NotificationResult[] = [];

      // Notify the assigned staff member
      const assigneeSms = isUrgent 
        ? `URGENT: Ticket #${ticketId.slice(-6)} assigned to you by ${ticketData.assigner_name}. Customer: ${data.customerName}`
        : `Ticket #${ticketId.slice(-6)} assigned to you. Customer: ${data.customerName}. Check portal.`;
        
      const assigneeEmailSubject = `${isUrgent ? '[URGENT] ' : ''}Ticket Assigned: ${ticketData.title}`;
      const assigneeEmailHtml = this.generateAssignmentEmailHtml(data);
      const assigneeEmailText = this.generateAssignmentEmailText(data);

      const assigneeResults = await this.sendNotification(
        assignedToId, ticketData.org_id, 'ticket_assigned',
        assigneeSms, assigneeEmailSubject, assigneeEmailHtml, assigneeEmailText, data, isUrgent
      );
      allResults.push(...assigneeResults);

      return allResults;

    } catch (error) {
      console.error('[NOTIFICATIONS] Error in notifyTicketAssigned:', error);
      return [{ success: false, type: 'email', error: error instanceof Error ? error.message : 'Unknown error' }];
    }
  }

  /**
   * Notify when a new ticket is created
   */
  public async notifyTicketCreated(
    ticketId: string,
    customerId: string,
    supportStaffIds: string[] = []
  ): Promise<NotificationResult[]> {
    try {
      // Get ticket and related data
      const [ticketData] = await db.execute(sql`
        SELECT 
          st.id, st.title, st.description, st.priority, st.org_id,
          o.name as org_name,
          c.name as customer_name, c.email as customer_email
        FROM support_tickets st
        JOIN orgs o ON st.org_id = o.id
        LEFT JOIN users c ON st.submitted_by = c.id
        WHERE st.id = ${ticketId}
      `);

      if (!ticketData) {
        throw new Error('Ticket not found');
      }

      const data: NotificationData = {
        ticketId,
        ticketTitle: ticketData.title,
        customerName: ticketData.customer_name || 'Unknown Customer',
        orgName: ticketData.org_name,
        priority: ticketData.priority,
        supportUrl: `${process.env.APP_URL || 'https://app.taska.com.au'}/support/tickets/${ticketId}`
      };

      const isUrgent = ticketData.priority === 'urgent';
      const allResults: NotificationResult[] = [];

      // Notify customer (confirmation)
      const customerSms = `Ticket #${ticketId.slice(-6)} created. We'll respond within 24hrs. Track at: ${data.supportUrl}`;
      const customerEmailSubject = `Support Ticket Created: ${ticketData.title}`;
      const customerEmailHtml = this.generateTicketCreatedEmailHtml(data, true);
      const customerEmailText = this.generateTicketCreatedEmailText(data, true);

      const customerResults = await this.sendNotification(
        customerId, ticketData.org_id, 'ticket_created_customer',
        customerSms, customerEmailSubject, customerEmailHtml, customerEmailText, data, false
      );
      allResults.push(...customerResults);

      // Notify support staff
      for (const staffId of supportStaffIds) {
        const staffSms = isUrgent 
          ? `URGENT: New ticket #${ticketId.slice(-6)} from ${data.customerName}. Priority: ${ticketData.priority.toUpperCase()}`
          : `New ticket #${ticketId.slice(-6)} from ${data.customerName}. Check support portal.`;
        
        const staffEmailSubject = `${isUrgent ? '[URGENT] ' : ''}New Support Ticket: ${ticketData.title}`;
        const staffEmailHtml = this.generateTicketCreatedEmailHtml(data, false);
        const staffEmailText = this.generateTicketCreatedEmailText(data, false);

        const staffResults = await this.sendNotification(
          staffId, ticketData.org_id, 'ticket_created_staff',
          staffSms, staffEmailSubject, staffEmailHtml, staffEmailText, data, isUrgent
        );
        allResults.push(...staffResults);
      }

      return allResults;

    } catch (error) {
      console.error('[NOTIFICATIONS] Error in notifyTicketCreated:', error);
      return [{ success: false, type: 'email', error: error instanceof Error ? error.message : 'Unknown error' }];
    }
  }

  /**
   * Generate ticket created email HTML template
   */
  private generateTicketCreatedEmailHtml(data: NotificationData, isCustomer: boolean): string {
    const title = isCustomer ? 'Support Ticket Created' : 'New Support Ticket Assigned';
    const greeting = isCustomer ? 'Thank you for contacting support!' : 'A new support ticket has been created:';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0;">${data.orgName}</h1>
          <h2 style="margin: 8px 0 0 0; color: #666;">${title}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
          <p>${greeting}</p>
          
          <h3 style="margin-top: 20px; color: #333;">Ticket Details</h3>
          <p><strong>Ticket ID:</strong> #${data.ticketId.slice(-6)}</p>
          <p><strong>Title:</strong> ${data.ticketTitle}</p>
          <p><strong>Priority:</strong> <span style="text-transform: capitalize; color: ${data.priority === 'urgent' ? '#dc2626' : '#666'};">${data.priority}</span></p>
          ${!isCustomer ? `<p><strong>Customer:</strong> ${data.customerName}</p>` : ''}
          
          ${isCustomer ? `
            <h3 style="margin-top: 20px; color: #333;">What happens next?</h3>
            <p>Our support team will review your ticket and respond within 24 hours. You'll receive email updates as we work on your issue.</p>
          ` : `
            <h3 style="margin-top: 20px; color: #333;">Action Required</h3>
            <p>Please review this ticket and respond promptly${data.priority === 'urgent' ? ' - this is marked as URGENT' : ''}.</p>
          `}
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${data.supportUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Ticket</a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
          <p>This notification was sent from ${data.orgName} via Taska Support.</p>
          ${isCustomer ? '<p>You can manage your notification preferences in your account settings.</p>' : ''}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate ticket created email text template
   */
  private generateTicketCreatedEmailText(data: NotificationData, isCustomer: boolean): string {
    const title = isCustomer ? 'Support Ticket Created' : 'New Support Ticket';
    const greeting = isCustomer ? 'Thank you for contacting support!' : 'A new support ticket has been created:';
    
    return `
${title}
${data.orgName}

${greeting}

Ticket Details:
- Ticket ID: #${data.ticketId.slice(-6)}
- Title: ${data.ticketTitle}
- Priority: ${data.priority.toUpperCase()}
${!isCustomer ? `- Customer: ${data.customerName}` : ''}

${isCustomer ? `
What happens next?
Our support team will review your ticket and respond within 24 hours. You'll receive email updates as we work on your issue.
` : `
Action Required:
Please review this ticket and respond promptly${data.priority === 'urgent' ? ' - this is marked as URGENT' : ''}.
`}

View Ticket: ${data.supportUrl}

---
This notification was sent from ${data.orgName} via Taska Support.
${isCustomer ? 'You can manage your notification preferences in your account settings.' : ''}
    `;
  }

  /**
   * Generate SMS for status changes
   */
  private generateStatusChangeSms(data: NotificationData, oldStatus: string, newStatus: string, isCustomer: boolean): string {
    const ticketRef = `#${data.ticketId.slice(-6)}`;
    
    if (isCustomer) {
      switch (newStatus) {
        case 'in_progress':
          return `Your ticket ${ticketRef} is now being worked on by our support team.`;
        case 'resolved':
          return `Your ticket ${ticketRef} has been resolved! Please check: ${data.supportUrl}`;
        case 'closed':
          return `Ticket ${ticketRef} is closed. Contact us if you need further assistance.`;
        default:
          return `Ticket ${ticketRef} status updated to: ${newStatus}. Check portal for details.`;
      }
    } else {
      return `Ticket ${ticketRef} (${data.customerName}): ${oldStatus} → ${newStatus.toUpperCase()}`;
    }
  }

  /**
   * Generate status change email HTML
   */
  private generateStatusChangeEmailHtml(data: NotificationData, oldStatus: string, newStatus: string, isCustomer: boolean): string {
    const statusColor = this.getStatusColor(newStatus);
    const statusMessage = this.getStatusMessage(newStatus, isCustomer);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket Status Update</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0;">${data.orgName}</h1>
          <h2 style="margin: 8px 0 0 0; color: #666;">Ticket Status Update</h2>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #333;">Status Changed</h3>
          <p><strong>Ticket:</strong> #${data.ticketId.slice(-6)} - ${data.ticketTitle}</p>
          ${!isCustomer ? `<p><strong>Customer:</strong> ${data.customerName}</p>` : ''}
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Status changed from:</strong> <span style="text-transform: capitalize;">${oldStatus}</span></p>
            <p style="margin: 5px 0 0 0;"><strong>New status:</strong> <span style="text-transform: capitalize; color: ${statusColor}; font-weight: bold;">${newStatus}</span></p>
          </div>
          
          <p>${statusMessage}</p>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${data.supportUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Ticket</a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
          <p>This notification was sent from ${data.orgName} via Taska Support.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate status change email text
   */
  private generateStatusChangeEmailText(data: NotificationData, oldStatus: string, newStatus: string, isCustomer: boolean): string {
    const statusMessage = this.getStatusMessage(newStatus, isCustomer);
    
    return `
Ticket Status Update
${data.orgName}

Your ticket status has been updated:

Ticket: #${data.ticketId.slice(-6)} - ${data.ticketTitle}
${!isCustomer ? `Customer: ${data.customerName}` : ''}
Status changed from: ${oldStatus} → ${newStatus.toUpperCase()}

${statusMessage}

View Ticket: ${data.supportUrl}

---
This notification was sent from ${data.orgName} via Taska Support.
    `;
  }

  /**
   * Generate new message email HTML
   */
  private generateNewMessageEmailHtml(data: NotificationData, isCustomer: boolean): string {
    const title = isCustomer ? 'New Reply to Your Support Ticket' : 'New Customer Message';
    const messagePreview = data.message ? data.message.substring(0, 300) + (data.message.length > 300 ? '...' : '') : '';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0;">${data.orgName}</h1>
          <h2 style="margin: 8px 0 0 0; color: #666;">${title}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #333;">Message Details</h3>
          <p><strong>Ticket:</strong> #${data.ticketId.slice(-6)} - ${data.ticketTitle}</p>
          <p><strong>From:</strong> ${data.messageAuthor}</p>
          ${!isCustomer ? `<p><strong>Customer:</strong> ${data.customerName}</p>` : ''}
          
          ${messagePreview ? `
          <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
            <p style="margin: 0; font-style: italic;">"${messagePreview}"</p>
          </div>
          ` : ''}
          
          <p>${isCustomer ? 'Our support team has replied to your ticket.' : 'The customer has added a new message to their ticket.'} Click below to view the full conversation and respond.</p>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${data.supportUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View & Reply</a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
          <p>This notification was sent from ${data.orgName} via Taska Support.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate new message email text
   */
  private generateNewMessageEmailText(data: NotificationData, isCustomer: boolean): string {
    const title = isCustomer ? 'New Reply to Your Support Ticket' : 'New Customer Message';
    const messagePreview = data.message ? data.message.substring(0, 200) + (data.message.length > 200 ? '...' : '') : '';
    
    return `
${title}
${data.orgName}

${isCustomer ? 'Our support team has replied to your ticket.' : 'The customer has added a new message to their ticket.'}

Ticket: #${data.ticketId.slice(-6)} - ${data.ticketTitle}
From: ${data.messageAuthor}
${!isCustomer ? `Customer: ${data.customerName}` : ''}

${messagePreview ? `Message Preview:\n"${messagePreview}"` : ''}

View full conversation and reply: ${data.supportUrl}

---
This notification was sent from ${data.orgName} via Taska Support.
    `;
  }

  /**
   * Generate assignment email HTML
   */
  private generateAssignmentEmailHtml(data: NotificationData): string {
    const urgentBadge = data.priority === 'urgent' ? '<span style="background: #dc2626; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">URGENT</span>' : '';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket Assigned to You</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0;">${data.orgName}</h1>
          <h2 style="margin: 8px 0 0 0; color: #666;">Ticket Assigned to You ${urgentBadge}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #333;">Assignment Details</h3>
          <p><strong>Ticket:</strong> #${data.ticketId.slice(-6)} - ${data.ticketTitle}</p>
          <p><strong>Customer:</strong> ${data.customerName}</p>
          <p><strong>Priority:</strong> <span style="text-transform: capitalize; color: ${this.getPriorityColor(data.priority)}; font-weight: bold;">${data.priority}</span></p>
          <p><strong>Assigned to:</strong> ${data.assigneeName}</p>
          
          ${data.priority === 'urgent' ? `
          <div style="background: #fef2f2; border: 1px solid #fca5a5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #dc2626; font-weight: bold;">⚠️ URGENT TICKET</p>
            <p style="margin: 5px 0 0 0; color: #dc2626;">This ticket requires immediate attention. Please respond as soon as possible.</p>
          </div>
          ` : ''}
          
          <p>You have been assigned to handle this support ticket. Please review the details and respond to the customer promptly.</p>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${data.supportUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View & Respond</a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
          <p>This notification was sent from ${data.orgName} via Taska Support.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate assignment email text
   */
  private generateAssignmentEmailText(data: NotificationData): string {
    return `
Ticket Assigned to You${data.priority === 'urgent' ? ' - URGENT' : ''}
${data.orgName}

You have been assigned to handle this support ticket:

Ticket: #${data.ticketId.slice(-6)} - ${data.ticketTitle}
Customer: ${data.customerName}
Priority: ${data.priority.toUpperCase()}
Assigned to: ${data.assigneeName}

${data.priority === 'urgent' ? `⚠️ URGENT TICKET - This ticket requires immediate attention. Please respond as soon as possible.` : 'Please review the details and respond to the customer promptly.'}

View & Respond: ${data.supportUrl}

---
This notification was sent from ${data.orgName} via Taska Support.
    `;
  }

  /**
   * Get color for ticket status
   */
  private getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'open': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'resolved': return '#10b981';
      case 'closed': return '#6b7280';
      default: return '#3b82f6';
    }
  }

  /**
   * Get color for priority
   */
  private getPriorityColor(priority: string): string {
    switch (priority.toLowerCase()) {
      case 'urgent': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#3b82f6';
      case 'low': return '#10b981';
      default: return '#3b82f6';
    }
  }

  /**
   * Get status-specific message for customers/staff
   */
  private getStatusMessage(status: string, isCustomer: boolean): string {
    if (isCustomer) {
      switch (status.toLowerCase()) {
        case 'in_progress':
          return 'Our support team is actively working on your issue. We\'ll keep you updated on progress.';
        case 'resolved':
          return 'We believe your issue has been resolved. If you need further assistance, please let us know.';
        case 'closed':
          return 'This ticket has been closed. If you need further help with this issue, you can reopen it by replying.';
        default:
          return 'Your ticket status has been updated. Please check the support portal for more details.';
      }
    } else {
      switch (status.toLowerCase()) {
        case 'open':
          return 'This ticket is now open and ready for assignment or response.';
        case 'in_progress':
          return 'This ticket is being actively worked on by the assigned support staff.';
        case 'resolved':
          return 'The issue has been marked as resolved. Customer can provide feedback or reopen if needed.';
        case 'closed':
          return 'This ticket has been closed and is no longer active.';
        default:
          return 'The ticket status has been updated by a team member.';
      }
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();