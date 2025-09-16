import { apiRequest } from './queryClient';

export interface TikTokTrackingData {
  eventType: 'ViewContent' | 'CompleteRegistration' | 'ClickButton' | 'Lead';
  contentData?: {
    contentId?: string;
    contentType?: string;
    contentName?: string;
    contentCategory?: string;
    value?: number;
    currency?: string;
  };
  pageUrl?: string;
  referrer?: string;
  customerInfo?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
}

export interface TikTokTrackingResponse {
  success: boolean;
  eventId?: string;
  message?: string;
  error?: string;
}

/**
 * Track TikTok Events API events from the frontend
 * This function makes a secure call to the backend which handles the actual TikTok API integration
 */
export async function trackTikTokEvent(data: TikTokTrackingData): Promise<TikTokTrackingResponse | null> {
  try {
    // Only track in browser environment
    if (typeof window === 'undefined') {
      return null;
    }

    // Add current page info if not provided
    const trackingData = {
      ...data,
      pageUrl: data.pageUrl || window.location.href,
      referrer: data.referrer || document.referrer,
    };

    console.log('[TIKTOK_TRACKING] Tracking event:', trackingData.eventType, trackingData.contentData);

    const response = await apiRequest('POST', '/api/tiktok/track', trackingData);
    const result = await response.json() as TikTokTrackingResponse;
    
    console.log('[TIKTOK_TRACKING] Event tracked successfully:', result);
    return result;
  } catch (error) {
    // Log error but don't throw - tracking failures shouldn't break the user experience
    console.warn('[TIKTOK_TRACKING] Failed to track event:', error);
    return null;
  }
}

/**
 * Track ViewContent events for page views
 */
export async function trackViewContent(params: {
  contentId?: string;
  contentType: string;
  contentName?: string;
  contentCategory?: string;
  value?: number;
  currency?: string;
}): Promise<void> {
  await trackTikTokEvent({
    eventType: 'ViewContent',
    contentData: {
      contentId: params.contentId,
      contentType: params.contentType,
      contentName: params.contentName,
      contentCategory: params.contentCategory,
      value: params.value,
      currency: params.currency || 'AUD',
    },
  });
}

/**
 * Track Lead events for form submissions
 */
export async function trackLead(params: {
  contentName?: string;
  contentCategory?: string;
  value?: number;
  currency?: string;
}): Promise<void> {
  await trackTikTokEvent({
    eventType: 'Lead',
    contentData: {
      contentName: params.contentName,
      contentCategory: params.contentCategory,
      contentType: 'lead',
      value: params.value,
      currency: params.currency || 'AUD',
    },
  });
}

/**
 * Track ClickButton events for important button clicks
 */
export async function trackClickButton(params: {
  contentName: string;
  contentCategory?: string;
}): Promise<void> {
  await trackTikTokEvent({
    eventType: 'ClickButton',
    contentData: {
      contentName: params.contentName,
      contentCategory: params.contentCategory || 'button_click',
      contentType: 'button',
    },
  });
}