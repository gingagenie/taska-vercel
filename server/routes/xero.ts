import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrg } from '../middleware/tenancy';
import { checkSubscription, requireActiveSubscription } from '../middleware/subscription';
import { xeroService } from '../services/xero';

const router = Router();

// Start OAuth2 flow
router.get('/connect', requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req: Request, res: Response) => {
  const orgId = (req as any).orgId as string;
  try {
    // orgId is embedded in the OAuth state param (primary) and also stored in
    // session (fallback) in case state is stripped by the browser/proxy.
    const authUrl = await xeroService.getAuthUrl(orgId);

    if (req.session) {
      (req.session as any).xeroOrgId = orgId;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ authUrl });
  } catch (error) {
    console.error('[Xero] connect error:', error);
    res.status(500).json({ error: 'Failed to initiate Xero connection' });
  }
});

// Handle OAuth2 callback from Xero
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  const protocol = req.get('X-Forwarded-Proto') || req.protocol;
  const host = req.get('Host');
  const baseUrl = `${protocol}://${host}`;

  console.log('[Xero] callback: code present:', !!code, 'state present:', !!state);

  if (!code || typeof code !== 'string') {
    return res.redirect(`${baseUrl}/settings?xero_error=invalid_code`);
  }

  // Prefer state param (embedded in auth URL), fall back to session
  const stateOrgId = typeof state === 'string' && state.length > 0 ? state : undefined;
  const sessionOrgId = (req.session as any)?.xeroOrgId;
  const orgId = stateOrgId || sessionOrgId;

  if (!orgId) {
    console.error('[Xero] callback: no orgId in state or session');
    return res.redirect(`${baseUrl}/settings?xero_error=missing_org`);
  }

  try {
    const result = await xeroService.handleCallback(code, orgId);

    // Clear session data
    if (req.session) {
      delete (req.session as any).xeroOrgId;
    }

    const tenantParam = result.tenantName ? encodeURIComponent(result.tenantName) : '';
    res.redirect(`${baseUrl}/settings?xero_success=true&tenant=${tenantParam}`);
  } catch (error: any) {
    console.error('[Xero] callback error:', error?.message);
    res.redirect(`${baseUrl}/settings?xero_error=connection_failed`);
  }
});

// Get integration status
router.get('/status', requireAuth, requireOrg, async (req: Request, res: Response) => {
  const orgId = (req as any).orgId as string;
  try {
    const integration = await xeroService.getOrgIntegration(orgId);

    if (!integration) {
      return res.json({ connected: false });
    }

    // Surface token expiry so the UI can prompt reconnection before the next push fails
    const tokenExpired = integration.tokenExpiresAt
      ? new Date() > new Date(integration.tokenExpiresAt)
      : false;

    // Read payment account code via raw SQL since schema column may be newer
    const { db } = await import('../db/client');
    const { sql } = await import('drizzle-orm');
    const result: any = await db.execute(sql`
      SELECT xero_payment_account_code FROM org_integrations WHERE id = ${integration.id}::uuid
    `);

    res.json({
      connected: true,
      tenantName: integration.tenantName,
      connectedAt: integration.createdAt,
      tokenExpired,
      paymentAccountCode: result[0]?.xero_payment_account_code || null,
    });
  } catch (error) {
    console.error('[Xero] status error:', error);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
});

// Get Xero bank accounts for payment account picker
router.get('/accounts', requireAuth, requireOrg, async (req: Request, res: Response) => {
  const orgId = (req as any).orgId as string;
  try {
    const accounts = await xeroService.getAccounts(orgId);
    res.json({ accounts });
  } catch (error: any) {
    console.error('[Xero] accounts error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch Xero accounts' });
  }
});

// Save selected payment account code
router.post('/payment-account', requireAuth, requireOrg, async (req: Request, res: Response) => {
  const orgId = (req as any).orgId as string;
  try {
    const { accountCode } = req.body;
    if (!accountCode) {
      return res.status(400).json({ error: 'accountCode is required' });
    }
    await xeroService.savePaymentAccountCode(orgId, accountCode);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Xero] payment-account save error:', error);
    res.status(500).json({ error: error?.message || 'Failed to save payment account' });
  }
});

// Disconnect Xero integration
router.delete('/disconnect', requireAuth, requireOrg, async (req: Request, res: Response) => {
  const orgId = (req as any).orgId as string;
  try {
    await xeroService.disconnectIntegration(orgId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Xero] disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Xero' });
  }
});

export default router;
