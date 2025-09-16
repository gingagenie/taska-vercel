import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrg } from '../middleware/tenancy';
import { tiktokEvents } from '../services/tiktok-events';
import type { CustomerInfo } from '../services/tiktok-events';

const router = Router();

// POST /api/tiktok/track - Track events from frontend
router.post('/track', requireAuth, requireOrg, async (req, res) => {
  try {
    const { 
      eventType, 
      contentData, 
      pageUrl, 
      referrer,
      customerInfo: frontendCustomerInfo 
    } = req.body;

    // Validate required fields
    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    // Build customer info from request and user data
    const customerInfo: CustomerInfo = {
      email: frontendCustomerInfo?.email,
      firstName: frontendCustomerInfo?.firstName,
      lastName: frontendCustomerInfo?.lastName,
      phone: frontendCustomerInfo?.phone,
      ip: req.ip || req.connection.remoteAddress || '',
      userAgent: req.get('User-Agent') || '',
      city: frontendCustomerInfo?.city,
      state: frontendCustomerInfo?.state,
      country: frontendCustomerInfo?.country || 'AU',
      zipCode: frontendCustomerInfo?.zipCode,
    };

    // Track the event based on type
    let result;
    switch (eventType) {
      case 'ViewContent':
        result = await tiktokEvents.trackViewContent(
          customerInfo,
          contentData || {},
          pageUrl,
          referrer
        );
        break;
      case 'CompleteRegistration':
        result = await tiktokEvents.trackCompleteRegistration(
          customerInfo,
          contentData || {},
          pageUrl,
          referrer
        );
        break;
      case 'ClickButton':
        result = await tiktokEvents.trackClickButton(
          customerInfo,
          contentData || {},
          pageUrl,
          referrer
        );
        break;
      case 'Lead':
        result = await tiktokEvents.trackLead(
          customerInfo,
          contentData || {},
          pageUrl,
          referrer
        );
        break;
      default:
        return res.status(400).json({ error: `Unsupported event type: ${eventType}` });
    }

    // Return result
    if (result.success) {
      res.json({
        success: true,
        eventId: result.eventId,
        message: `${eventType} event tracked successfully`
      });
    } else {
      // Log error but don't expose details to client for security
      console.error(`[TIKTOK_TRACKING] Failed to track ${eventType}:`, result.error);
      res.status(500).json({
        success: false,
        error: 'Failed to track event'
      });
    }
  } catch (error) {
    console.error('[TIKTOK_TRACKING] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/tiktok/status - Check TikTok configuration status
router.get('/status', requireAuth, requireOrg, async (req, res) => {
  try {
    const status = tiktokEvents.getStatus();
    res.json(status);
  } catch (error) {
    console.error('[TIKTOK_TRACKING] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get TikTok status'
    });
  }
});

export default router;