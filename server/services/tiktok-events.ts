import crypto from 'crypto';

// TikTok Events API Configuration
const TIKTOK_API_ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const TIKTOK_PIXEL_ID = 'D34FV3JC77U1PDQ72P1G';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

if (!TIKTOK_ACCESS_TOKEN) {
  console.warn("Warning: TIKTOK_ACCESS_TOKEN not set. TikTok Events API functionality will be disabled.");
}

// TypeScript interfaces for TikTok Events API
export interface TikTokEventResult {
  success: boolean;
  error?: string;
  eventId?: string;
  apiResponse?: any;
}

export interface CustomerInfo {
  email?: string;
  phone?: string;
  ip?: string;
  userAgent?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

export interface EventData {
  value?: number;
  currency?: string;
  contentId?: string;
  contentType?: string;
  contentName?: string;
  contentCategory?: string;
  description?: string;
  query?: string;
  status?: string;
}

export interface TikTokEventPayload {
  pixel_code: string;
  event_source_id: string;
  data: [{
    event: string;
    event_time: number;
    event_id: string;
    event_source: string;
    user: {
      email?: string;
      phone?: string;
      external_id?: string;
    };
    properties?: {
      value?: number;
      currency?: string;
      content_id?: string;
      content_type?: string;
      content_name?: string;
      content_category?: string;
      description?: string;
      query?: string;
      status?: string;
    };
  }];
}

export interface TikTokApiResponse {
  code: number;
  message: string;
  request_id: string;
  data?: any;
}

/**
 * TikTok Events API Service for tracking advertising conversions
 * Handles ViewContent, CompleteRegistration, ClickButton, and Lead events
 */
export class TikTokEventsService {
  
  /**
   * Hash sensitive customer data using SHA-256 for privacy compliance
   */
  private hashPII(value: string): string {
    if (!value) return '';
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }

  /**
   * Normalize phone number to E.164 format for hashing
   */
  private normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Handle Australian mobile numbers (04xxxxxxxx -> +614xxxxxxxx)
    if (cleaned.startsWith('04') && cleaned.length === 10) {
      return `+61${cleaned.substring(1)}`;
    }
    
    // Handle international format already with country code
    if (cleaned.startsWith('614') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    
    // Handle other international formats with + prefix
    if (phone.startsWith('+')) {
      return phone.replace(/\D/g, '').length >= 10 ? phone : '';
    }
    
    return phone;
  }

  /**
   * Generate unique event ID for deduplication
   */
  private generateEventId(): string {
    return `tiktok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create base event payload structure
   */
  private createBasePayload(
    eventName: string,
    customerInfo: CustomerInfo,
    eventData?: EventData,
    pageUrl?: string,
    referrer?: string
  ): TikTokEventPayload {
    const eventId = this.generateEventId();
    const eventTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    // Hash PII data
    const hashedEmail = customerInfo.email ? this.hashPII(customerInfo.email) : undefined;
    const normalizedPhone = this.normalizePhoneNumber(customerInfo.phone || '');
    const hashedPhone = normalizedPhone ? this.hashPII(normalizedPhone) : undefined;

    // Create user external_id from available data
    const externalId = customerInfo.email ? this.hashPII(customerInfo.email) : undefined;

    const eventPayload = {
      event: eventName,
      event_time: eventTime,
      event_id: eventId,
      event_source: 'web',
      user: {
        email: hashedEmail,
        phone: hashedPhone,
        external_id: externalId,
      },
    };

    // Add event-specific properties if provided
    if (eventData) {
      eventPayload.properties = {
        value: eventData.value,
        currency: eventData.currency || 'AUD',
        content_id: eventData.contentId,
        content_type: eventData.contentType,
        content_name: eventData.contentName,
        content_category: eventData.contentCategory,
        description: eventData.description,
        query: eventData.query,
        status: eventData.status,
      };

      // Remove undefined properties
      Object.keys(eventPayload.properties).forEach(key => {
        if (eventPayload.properties![key as keyof typeof eventPayload.properties] === undefined) {
          delete eventPayload.properties![key as keyof typeof eventPayload.properties];
        }
      });
    }

    // Remove undefined user properties
    Object.keys(eventPayload.user).forEach(key => {
      if (eventPayload.user[key as keyof typeof eventPayload.user] === undefined) {
        delete eventPayload.user[key as keyof typeof eventPayload.user];
      }
    });

    const payload: TikTokEventPayload = {
      pixel_code: TIKTOK_PIXEL_ID,
      event_source_id: TIKTOK_PIXEL_ID,
      data: [eventPayload],
    };

    return payload;
  }

  /**
   * Send event to TikTok Events API
   */
  private async sendEvent(payload: TikTokEventPayload): Promise<TikTokEventResult> {
    if (!TIKTOK_ACCESS_TOKEN) {
      console.error('[TIKTOK_EVENTS] Cannot send event: TikTok access token not configured');
      return { success: false, error: 'TikTok access token not configured' };
    }

    try {
      console.log(`[TIKTOK_EVENTS] Sending ${payload.data[0].event} event with ID: ${payload.data[0].event_id}`);
      
      const response = await fetch(TIKTOK_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Access-Token': TIKTOK_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData: TikTokApiResponse = await response.json();

      if (response.ok && responseData.code === 0) {
        console.log(`[TIKTOK_EVENTS] ${payload.data[0].event} event sent successfully. Request ID: ${responseData.request_id}`);
        return { 
          success: true, 
          eventId: payload.data[0].event_id,
          apiResponse: responseData 
        };
      } else {
        console.error(`[TIKTOK_EVENTS] API Error for ${payload.data[0].event}:`, {
          status: response.status,
          code: responseData.code,
          message: responseData.message,
          requestId: responseData.request_id,
        });
        return { 
          success: false, 
          error: `TikTok API Error: ${responseData.message || 'Unknown error'}`,
          apiResponse: responseData 
        };
      }
    } catch (error) {
      console.error(`[TIKTOK_EVENTS] Network error sending ${payload.data[0].event}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  /**
   * Track ViewContent event - Page views of important content
   * Use for: Product pages, service pages, content consumption
   */
  public async trackViewContent(
    customerInfo: CustomerInfo,
    contentData: {
      contentId?: string;
      contentType?: string;
      contentName?: string;
      contentCategory?: string;
      value?: number;
      currency?: string;
    },
    pageUrl?: string,
    referrer?: string
  ): Promise<TikTokEventResult> {
    const eventData: EventData = {
      contentId: contentData.contentId,
      contentType: contentData.contentType || 'page',
      contentName: contentData.contentName,
      contentCategory: contentData.contentCategory,
      value: contentData.value,
      currency: contentData.currency,
    };

    const payload = this.createBasePayload('ViewContent', customerInfo, eventData, pageUrl, referrer);
    return this.sendEvent(payload);
  }

  /**
   * Track CompleteRegistration event - User signups
   * Use for: Account creation, newsletter signup, registration completion
   */
  public async trackCompleteRegistration(
    customerInfo: CustomerInfo,
    registrationData: {
      value?: number;
      currency?: string;
      status?: string;
      contentName?: string;
    } = {},
    pageUrl?: string,
    referrer?: string
  ): Promise<TikTokEventResult> {
    const eventData: EventData = {
      value: registrationData.value,
      currency: registrationData.currency,
      status: registrationData.status || 'completed',
      contentName: registrationData.contentName || 'User Registration',
      contentType: 'registration',
    };

    const payload = this.createBasePayload('CompleteRegistration', customerInfo, eventData, pageUrl, referrer);
    return this.sendEvent(payload);
  }

  /**
   * Track ClickButton event - Important button clicks
   * Use for: Call-to-action buttons, "Get Quote", "Contact Us", etc.
   */
  public async trackClickButton(
    customerInfo: CustomerInfo,
    buttonData: {
      contentName?: string;
      contentCategory?: string;
      description?: string;
      value?: number;
      currency?: string;
    },
    pageUrl?: string,
    referrer?: string
  ): Promise<TikTokEventResult> {
    const eventData: EventData = {
      contentName: buttonData.contentName,
      contentCategory: buttonData.contentCategory || 'button_click',
      contentType: 'button',
      description: buttonData.description,
      value: buttonData.value,
      currency: buttonData.currency,
    };

    const payload = this.createBasePayload('ClickButton', customerInfo, eventData, pageUrl, referrer);
    return this.sendEvent(payload);
  }

  /**
   * Track Lead event - Form submissions, customer creation
   * Use for: Contact forms, quote requests, lead generation
   */
  public async trackLead(
    customerInfo: CustomerInfo,
    leadData: {
      value?: number;
      currency?: string;
      contentName?: string;
      contentCategory?: string;
      description?: string;
      status?: string;
    },
    pageUrl?: string,
    referrer?: string
  ): Promise<TikTokEventResult> {
    const eventData: EventData = {
      value: leadData.value,
      currency: leadData.currency,
      contentName: leadData.contentName || 'Lead Generation',
      contentCategory: leadData.contentCategory || 'lead',
      contentType: 'lead',
      description: leadData.description,
      status: leadData.status || 'qualified',
    };

    const payload = this.createBasePayload('Lead', customerInfo, eventData, pageUrl, referrer);
    return this.sendEvent(payload);
  }

  /**
   * Utility method to check if TikTok Events API is configured
   */
  public isConfigured(): boolean {
    return !!TIKTOK_ACCESS_TOKEN;
  }

  /**
   * Get current configuration status
   */
  public getStatus(): { configured: boolean; pixelId: string; endpoint: string } {
    return {
      configured: this.isConfigured(),
      pixelId: TIKTOK_PIXEL_ID,
      endpoint: TIKTOK_API_ENDPOINT,
    };
  }
}

// Export a default instance for easy use
export const tiktokEvents = new TikTokEventsService();

// Export convenience functions for direct use
export const trackViewContent = (customerInfo: CustomerInfo, contentData: any, pageUrl?: string, referrer?: string) =>
  tiktokEvents.trackViewContent(customerInfo, contentData, pageUrl, referrer);

export const trackCompleteRegistration = (customerInfo: CustomerInfo, registrationData?: any, pageUrl?: string, referrer?: string) =>
  tiktokEvents.trackCompleteRegistration(customerInfo, registrationData, pageUrl, referrer);

export const trackClickButton = (customerInfo: CustomerInfo, buttonData: any, pageUrl?: string, referrer?: string) =>
  tiktokEvents.trackClickButton(customerInfo, buttonData, pageUrl, referrer);

export const trackLead = (customerInfo: CustomerInfo, leadData: any, pageUrl?: string, referrer?: string) =>
  tiktokEvents.trackLead(customerInfo, leadData, pageUrl, referrer);