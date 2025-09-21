import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface FacebookPixelProps {
  pixelId?: string;
}

/**
 * Facebook Pixel Component for Taska
 * 
 * Integrates Facebook Pixel tracking for advertising and conversion measurement.
 * Automatically tracks page views and provides methods for conversion events.
 */
export function FacebookPixel({ pixelId }: FacebookPixelProps) {
  const [location] = useLocation();
  const fbPixelId = pixelId || import.meta.env.VITE_FB_PIXEL_ID;

  // Initialize Facebook Pixel on component mount
  useEffect(() => {
    if (!fbPixelId) {
      console.warn('[Facebook Pixel] No pixel ID provided. Skipping initialization.');
      return;
    }

    // Skip if pixel is already loaded
    if (typeof window.fbq === 'function') {
      console.log('[Facebook Pixel] Already initialized');
      return;
    }

    // Facebook Pixel base code (from Meta setup instructions)
    const initPixel = () => {
      // Initialize the fbq function if not already present
      if (!window.fbq) {
        (function(f: any, b: any, e: any, v: any, n: any, t: any, s: any) {
          if (f.fbq) return;
          n = f.fbq = function() {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = true;
          n.version = '2.0';
          n.queue = [];
          t = b.createElement(e);
          t.async = true;
          t.src = v;
          s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js', undefined, undefined, undefined);
      }

      // Initialize pixel with provided ID
      window.fbq('init', fbPixelId);
      
      // Track initial page view
      window.fbq('track', 'PageView');
      
      console.log(`[Facebook Pixel] Initialized with ID: ${fbPixelId}`);
    };

    // Initialize pixel
    initPixel();

    // Add noscript fallback image to document head
    const noscriptImg = document.createElement('img');
    noscriptImg.height = 1;
    noscriptImg.width = 1;
    noscriptImg.style.display = 'none';
    noscriptImg.src = `https://www.facebook.com/tr?id=${fbPixelId}&ev=PageView&noscript=1`;
    noscriptImg.alt = 'Facebook Pixel';
    
    // Add to a noscript tag in head
    const noscript = document.createElement('noscript');
    noscript.appendChild(noscriptImg);
    document.head.appendChild(noscript);

    // Cleanup function
    return () => {
      // Remove noscript element on cleanup
      if (noscript && noscript.parentNode) {
        noscript.parentNode.removeChild(noscript);
      }
    };
  }, [fbPixelId]);

  // Track route changes for SPA navigation
  useEffect(() => {
    if (window.fbq && fbPixelId) {
      console.log(`[Facebook Pixel] Page view tracked: ${location}`);
      window.fbq('track', 'PageView');
    }
  }, [location, fbPixelId]);

  // Component renders nothing - this is a tracking-only component
  return null;
}

/**
 * Utility function to track custom conversion events
 */
export function trackEvent(eventName: string, parameters?: Record<string, any>) {
  if (!window.fbq) {
    console.warn('[Facebook Pixel] Pixel not initialized. Cannot track event:', eventName);
    return;
  }

  try {
    window.fbq('track', eventName as any, parameters);
    console.log(`[Facebook Pixel] Event tracked: ${eventName}`, parameters);
  } catch (error) {
    console.error('[Facebook Pixel] Error tracking event:', eventName, error);
  }
}

/**
 * Utility function to track custom business events specific to Taska
 */
export function trackTaskaEvent(eventName: string, parameters?: Record<string, any>) {
  if (!window.fbq) {
    console.warn('[Facebook Pixel] Pixel not initialized. Cannot track custom event:', eventName);
    return;
  }

  try {
    window.fbq('trackCustom', eventName, parameters);
    console.log(`[Facebook Pixel] Custom event tracked: ${eventName}`, parameters);
  } catch (error) {
    console.error('[Facebook Pixel] Error tracking custom event:', eventName, error);
  }
}

// Export standard event tracking functions for common business actions
export const FacebookPixelEvents = {
  // User registration/signup
  trackRegistration: (method: string = 'email') => {
    trackEvent('CompleteRegistration', { 
      content_name: 'User Registration',
      method 
    });
  },

  // Subscription/payment events
  trackSubscription: (value: number, currency: string = 'AUD', plan: string) => {
    trackEvent('Subscribe', { 
      value, 
      currency,
      content_name: `Taska ${plan} Plan`,
      subscription_id: plan.toLowerCase()
    });
  },

  // Lead generation (trial signups, contact forms)
  trackLead: (source: string = 'website') => {
    trackEvent('Lead', { 
      content_name: 'Lead Generation',
      source 
    });
  },

  // Business-specific custom events
  trackJobCreation: (jobType: string, value?: number) => {
    trackTaskaEvent('JobCreated', { 
      job_type: jobType,
      value: value || 0,
      currency: 'AUD'
    });
  },

  trackInvoiceGenerated: (amount: number, customerId: string) => {
    trackTaskaEvent('InvoiceGenerated', { 
      value: amount,
      currency: 'AUD',
      customer_id: customerId
    });
  },

  trackQuoteCreated: (amount: number, customerId: string) => {
    trackTaskaEvent('QuoteCreated', { 
      value: amount,
      currency: 'AUD',
      customer_id: customerId
    });
  }
};