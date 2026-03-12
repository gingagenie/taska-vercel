import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrg } from '../middleware/tenancy';
import { checkSubscription, requireActiveSubscription } from '../middleware/subscription';
import { xeroService } from '../services/xero';

interface AuthenticatedRequest extends Request {
  orgId: string;
}

const router = Router();

// Start OAuth2 flow
router.get('/connect', requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUrl = await xeroService.getAuthUrl(req.orgId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authUrl });
  } catch (error) {
    console.error('Xero connect error:', error);
    res.status(500).json({ error: 'Failed to initiate Xero connection' });
  }
});

// Handle OAuth2 callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;
  const protocol = req.get('X-Forwarded-Proto') || req.protocol;
  const host = req.get('Host');
  const baseUrl = `${protocol}://${host}`;

  console.log('[XERO CALLBACK] code:', !!code, 'state:', state);

  if (!code || typeof code !== 'string') {
    console.log('[XERO CALLBACK] Missing or invalid code');
    return res.redirect(`${baseUrl}/settings?xero_error=invalid_code`);
  }

  const orgId = state as string;
  if (!orgId) {
    console.log('[XERO CALLBACK] Missing orgId in state');
    return res.redirect(`${baseUrl}/settings?xero_error=missing_org`);
  }

  try {
    console.log('[XERO CALLBACK] Calling handleCallback with orgId:', orgId);
    const result = await xeroService.handleCallback(code, orgId);
    console.log('[XERO CALLBACK] Success:', result);
    res.redirect(`${baseUrl}/settings?xero_success=true&tenant=${encodeURIComponent(result.tenantName)}`);
  } catch (error: any) {
    console.error('[XERO CALLBACK] Error message:', error?.message);
    console.error('[XERO CALLBACK] Error stack:', error?.stack);
    res.redirect(`${baseUrl}/settings?xero_error=connection_failed`);
  }
});

// Get integration status
router.get('/status', requireAuth, requireOrg, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const integration = await xeroService.getOrgIntegration(req.orgId);

    if (!integration) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      tenantName: integration.tenantName,
      connectedAt: integration.createdAt,
    });
  } catch (error) {
    console.error('Xero status error:', error);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
});

// Disconnect Xero integration
router.delete('/disconnect', requireAuth, requireOrg, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const integration = await xeroService.getOrgIntegration(req.orgId);

    if (integration) {
      await xeroService.disconnectIntegration(req.orgId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Xero disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Xero' });
  }
});

export default router;
