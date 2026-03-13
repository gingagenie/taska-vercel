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
    return res.redirect(`${baseUrl}/settings?xero_error=invalid_code`);
  }

  const orgId = state as string;
  if (!orgId) {
    return res.redirect(`${baseUrl}/settings?xero_error=missing_org`);
  }

  try {
    const result = await xeroService.handleCallback(code, orgId);
    res.redirect(`${baseUrl}/settings?xero_success=true&tenant=${encodeURIComponent(result.tenantName)}`);
  } catch (error: any) {
    console.error('[XERO CALLBACK] Error:', error?.message);
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

    // Read payment account code via raw SQL since schema column is new
    const { db } = await import('../db/client');
    const { sql } = await import('drizzle-orm');
    const result: any = await db.execute(sql`
      SELECT xero_payment_account_code FROM org_integrations WHERE id = ${integration.id}::uuid
    `);

    res.json({
      connected: true,
      tenantName: integration.tenantName,
      connectedAt: integration.createdAt,
      paymentAccountCode: result[0]?.xero_payment_account_code || null,
    });
  } catch (error) {
    console.error('Xero status error:', error);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
});

// Get Xero bank accounts for payment account picker
router.get('/accounts', requireAuth, requireOrg, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await xeroService.getAccounts(req.orgId);
    res.json({ accounts });
  } catch (error: any) {
    console.error('Xero accounts error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch Xero accounts' });
  }
});

// Save selected payment account code
router.post('/payment-account', requireAuth, requireOrg, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountCode } = req.body;
    if (!accountCode) {
      return res.status(400).json({ error: 'accountCode is required' });
    }
    await xeroService.savePaymentAccountCode(req.orgId, accountCode);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Xero payment account save error:', error);
    res.status(500).json({ error: error?.message || 'Failed to save payment account' });
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
