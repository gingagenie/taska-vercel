import { XeroClient } from 'xero-node';
import { Invoice, Quote, Contact, Payment, QuoteStatusCodes } from 'xero-node';
import { db } from '../db/client';
import { orgIntegrations } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

// Redirect URIs used for OAuth — must match Xero app settings
const REDIRECT_URIS = [
  `https://9ff4247f-54b9-471d-b15a-9b5fc08ac58f-00-4wmqlnoqtzla.janeway.replit.dev/api/xero/callback`,
  `https://taska.info/api/xero/callback`,
];

// offline_access is REQUIRED to receive a long-lived refresh token.
// Without it, Xero does not issue a refresh token and the connection
// drops after every 30-minute access token expiry.
const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'accounting.settings',
  'offline_access',
];

/** Create a fresh XeroClient configured with app credentials only (no tokens). */
function makeBaseClient(): XeroClient {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    throw new Error('Xero credentials not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables.');
  }
  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    redirectUris: REDIRECT_URIS,
    scopes: XERO_SCOPES,
  });
}

export class XeroService {
  // Used only for the OAuth consent flow (stateless between users)
  private oauthClient: XeroClient | null = null;

  constructor() {
    if (process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET) {
      this.oauthClient = makeBaseClient();
    }
  }

  private ensureOauthClient(): XeroClient {
    if (!this.oauthClient) {
      throw new Error('Xero credentials not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables.');
    }
    return this.oauthClient;
  }

  isConfigured(): boolean {
    return this.oauthClient !== null;
  }

  /**
   * Build the Xero consent URL, embedding orgId as the OAuth state parameter
   * so the callback can identify the org even if the session is unavailable.
   * offline_access must also appear in the scope here (not just the client config).
   */
  async getAuthUrl(state: string): Promise<string> {
    this.ensureOauthClient();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.XERO_CLIENT_ID!,
      redirect_uri: 'https://taska.info/api/xero/callback',
      scope: XERO_SCOPES.join(' '),
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, orgId: string) {
    this.ensureOauthClient();
    console.log('[Xero] handleCallback: processing code for org', orgId);

    // Exchange the code directly via the token endpoint.
    // client.apiCallback() expects the full redirect URL (not just the code) and
    // relies on internal PKCE state that is never seeded when the auth URL is built
    // manually in getAuthUrl(), so we bypass it entirely.
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: 'https://taska.info/api/xero/callback',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error('[Xero] handleCallback: token exchange failed:', tokenResponse.status, body);
      throw new Error(`Xero token exchange failed: ${tokenResponse.status} ${body}`);
    }

    const tokenSet = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    console.log('[Xero] handleCallback: access_token present:', !!tokenSet.access_token);
    console.log('[Xero] handleCallback: refresh_token present:', !!tokenSet.refresh_token);

    if (!tokenSet.access_token) {
      console.error('[Xero] handleCallback: token response:', JSON.stringify(tokenSet));
      throw new Error('Failed to get access token from Xero');
    }

    if (!tokenSet.refresh_token) {
      console.warn('[Xero] handleCallback: WARNING - no refresh token received. offline_access scope may be missing from Xero app config.');
    }

    // Hydrate a fresh client with the new tokens to fetch tenants
    console.log('[Xero] handleCallback: fetching tenants...');
    const client = makeBaseClient();
    client.setTokenSet({
      access_token:  tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      expires_in:    tokenSet.expires_in,
    });

    try {
      await client.updateTenants();
    } catch (tenantError: any) {
      console.error('[Xero] handleCallback: updateTenants failed:', JSON.stringify(tenantError));
      throw tenantError;
    }

    const activeTenant = client.tenants[0];
    if (!activeTenant) {
      throw new Error('No Xero tenants available');
    }

    const expiresAt = new Date(Date.now() + (tokenSet.expires_in || 1800) * 1000);

    // Upsert integration
    const existing = await db
      .select()
      .from(orgIntegrations)
      .where(and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.provider, 'xero')))
      .limit(1);

    const integration = {
      orgId,
      provider: 'xero' as const,
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token || null,
      tokenExpiresAt: expiresAt,
      tenantId: activeTenant.tenantId || null,
      tenantName: activeTenant.tenantName || null,
      isActive: true,
    };

    if (existing.length > 0) {
      await db
        .update(orgIntegrations)
        .set({ ...integration, updatedAt: new Date() })
        .where(eq(orgIntegrations.id, existing[0].id));
      console.log('[Xero] handleCallback: updated existing integration for org', orgId);
    } else {
      await db.insert(orgIntegrations).values(integration);
      console.log('[Xero] handleCallback: inserted new integration for org', orgId);
    }

    return { tenantName: activeTenant.tenantName, tenantId: activeTenant.tenantId };
  }

  async getOrgIntegration(orgId: string) {
    const rows = await db
      .select()
      .from(orgIntegrations)
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, 'xero'),
        eq(orgIntegrations.isActive, true),
      ))
      .limit(1);

    return rows[0] || null;
  }

  /**
   * Refresh the stored tokens if they are within 5 minutes of expiry.
   * Persists new tokens to DB. Returns the (possibly updated) integration row,
   * or null if not found / refresh failed.
   *
   * On unrecoverable refresh failure (e.g. refresh token revoked / 60-day expiry),
   * marks the integration as inactive so the UI correctly shows "disconnected".
   */
  async refreshTokensIfNeeded(orgId: string) {
    const integration = await this.getOrgIntegration(orgId);
    if (!integration) return null;

    const now = new Date();
    const expiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : new Date(0);
    const needsRefresh = now >= new Date(expiresAt.getTime() - 10 * 60 * 1000);

    if (!needsRefresh) return integration;

    if (!integration.refreshToken) {
      console.warn('[Xero] refreshTokensIfNeeded: no refresh token for org', orgId, '— marking inactive');
      await this.markInactive(orgId);
      return null;
    }

    try {
      // Use raw fetch to the Xero token endpoint — same pattern as handleCallback.
      // xero-node's internal refreshToken() relies on openid-client state that is
      // not reliably seeded when we call setTokenSet(), so we bypass it entirely.
      const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: integration.refreshToken,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        console.error('[Xero] refreshTokensIfNeeded: token refresh failed:', tokenResponse.status, body);
        throw new Error(`Xero token refresh failed: ${tokenResponse.status} ${body}`);
      }

      const newTokenSet = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (!newTokenSet.access_token) {
        throw new Error('Refresh returned no access token');
      }

      const newExpiresAt = new Date(Date.now() + (newTokenSet.expires_in || 1800) * 1000);

      // CRITICAL: Always save the new refresh token — Xero refresh tokens are
      // one-time use. If we don't save the new one the token chain is broken.
      // Fall back to old refresh token only within the 30-min grace period.
      await db
        .update(orgIntegrations)
        .set({
          accessToken: newTokenSet.access_token,
          refreshToken: newTokenSet.refresh_token || integration.refreshToken,
          tokenExpiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(orgIntegrations.id, integration.id));

      console.log('[Xero] refreshTokensIfNeeded: tokens refreshed for org', orgId,
        '| new access_token:', !!newTokenSet.access_token,
        '| new refresh_token:', !!newTokenSet.refresh_token,
        '| expires_in:', newTokenSet.expires_in);

      return {
        ...integration,
        accessToken: newTokenSet.access_token,
        refreshToken: newTokenSet.refresh_token || integration.refreshToken,
        tokenExpiresAt: newExpiresAt,
      };
    } catch (error: any) {
      console.error('[Xero] refreshTokensIfNeeded: refresh failed for org', orgId, error?.message || error);
      // Mark inactive so status endpoint reflects reality
      await this.markInactive(orgId);
      return null;
    }
  }

  private async markInactive(orgId: string) {
    await db
      .update(orgIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.provider, 'xero')));
  }

  /**
   * Build a fresh XeroClient fully hydrated with the org's current tokens.
   * Always refreshes if tokens are near expiry before returning.
   * Returns null if the org has no active integration.
   */
  private async getHydratedClient(orgId: string): Promise<{ client: XeroClient; integration: NonNullable<Awaited<ReturnType<XeroService['refreshTokensIfNeeded']>>> } | null> {
    const integration = await this.refreshTokensIfNeeded(orgId);
    if (!integration || !integration.accessToken) return null;

    const client = makeBaseClient();
    client.setTokenSet({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken || undefined,
      expires_in: Math.max(
        0,
        Math.floor((new Date(integration.tokenExpiresAt!).getTime() - Date.now()) / 1000),
      ),
    });

    return { client, integration };
  }

  /**
   * Execute a Xero API call, automatically retrying once on 401
   * (force-refreshing the token before the retry).
   */
  private async callWithRetry<T>(
    orgId: string,
    fn: (client: XeroClient, tenantId: string) => Promise<T>,
  ): Promise<T> {
    const hydrated = await this.getHydratedClient(orgId);
    if (!hydrated) {
      throw new Error('Xero integration not found or tokens expired. Please reconnect in Settings.');
    }

    const { client, integration } = hydrated;

    try {
      return await fn(client, integration.tenantId || '');
    } catch (error: any) {
      const status = error?.response?.statusCode ?? error?.statusCode;
      if (status !== 401) throw error;

      console.warn('[Xero] callWithRetry: got 401, force-refreshing token for org', orgId);

      // Force refresh by stamping epoch expiry in DB, then re-hydrate
      await db
        .update(orgIntegrations)
        .set({ tokenExpiresAt: new Date(0), updatedAt: new Date() })
        .where(and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.provider, 'xero')));

      const retryHydrated = await this.getHydratedClient(orgId);
      if (!retryHydrated) {
        throw new Error('Xero token refresh failed after 401. Please reconnect in Settings.');
      }

      return await fn(retryHydrated.client, retryHydrated.integration.tenantId || '');
    }
  }

  async getAccounts(orgId: string) {
    return this.callWithRetry(orgId, async (client, tenantId) => {
      const response = await client.accountingApi.getAccounts(tenantId);
      return (response.body.accounts || [])
        .filter((a: any) => a.type === 'BANK')
        .map((a: any) => ({
          code: a.code,
          name: a.name,
          type: a.type,
        }));
    });
  }

  async savePaymentAccountCode(orgId: string, accountCode: string) {
    const integration = await this.getOrgIntegration(orgId);
    if (!integration) throw new Error('Xero integration not found');

    await db.execute(
      (await import('drizzle-orm')).sql`
        UPDATE org_integrations
        SET xero_payment_account_code = ${accountCode}, updated_at = NOW()
        WHERE id = ${integration.id}::uuid
      `
    );
  }

  async createPayment(orgId: string, xeroInvoiceId: string, amount: number, date: string) {
    return this.callWithRetry(orgId, async (client, tenantId) => {
      const { db: dbClient } = await import('../db/client');
      const { sql } = await import('drizzle-orm');

      // Re-fetch integration for payment account code
      const rows: any = await dbClient.execute(sql`
        SELECT xero_payment_account_code FROM org_integrations
        WHERE org_id = ${orgId}::uuid AND provider = 'xero' AND is_active = true
        LIMIT 1
      `);
      const accountCode = rows[0]?.xero_payment_account_code;

      if (!accountCode) {
        throw new Error('No Xero payment account configured. Set one in Settings → Integrations.');
      }

      const payment: Payment = {
        invoice: { invoiceID: xeroInvoiceId },
        account: { code: accountCode },
        amount,
        date,
      };

      const response = await client.accountingApi.createPayment(tenantId, payment);
      return response.body.payments?.[0];
    });
  }

  /**
   * Creates an invoice in Xero as AUTHORISED (approved, awaiting payment).
   * Xero generates the invoice number — written back to Taska after creation.
   * accountCode 200 = Sales (standard AU Xero)
   * taxType OUTPUT = GST on income (10%), NONE = no tax
   */
  async createInvoiceInXero(orgId: string, invoiceData: any) {
    return this.callWithRetry(orgId, async (client, tenantId) => {
      const contact: Contact = {
        name: invoiceData.customerName,
        emailAddress: invoiceData.customerEmail,
      };

      const xeroInvoice: Invoice = {
        type: Invoice.TypeEnum.ACCREC,
        contact,
        lineItems: invoiceData.items.map((item: any) => ({
          description: item.name || item.description,
          quantity: item.quantity || 1,
          unitAmount: parseFloat(item.price || '0'),
          accountCode: '200',
          taxType: Number(item.taxRate || 0) > 0 ? 'OUTPUT' : 'NONE',
        })),
        date: new Date().toISOString().split('T')[0],
        dueDate: invoiceData.dueAt
          ? new Date(invoiceData.dueAt).toISOString().split('T')[0]
          : undefined,
        status: Invoice.StatusEnum.AUTHORISED,
        currencyCode: invoiceData.currency || 'AUD',
      };

      const response = await client.accountingApi.createInvoices(tenantId, { invoices: [xeroInvoice] });
      return response.body.invoices?.[0];
    });
  }

  async createQuoteInXero(orgId: string, quoteData: any) {
    return this.callWithRetry(orgId, async (client, tenantId) => {
      const contact: Contact = {
        name: quoteData.customerName,
        emailAddress: quoteData.customerEmail,
      };

      const xeroQuote: Quote = {
        contact,
        lineItems: quoteData.items.map((item: any) => ({
          description: item.name || item.description,
          quantity: item.quantity || 1,
          unitAmount: parseFloat(item.price || '0'),
        })),
        date: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: QuoteStatusCodes.DRAFT,
        currencyCode: quoteData.currency || 'AUD',
        title: quoteData.title,
      };

      const response = await client.accountingApi.createQuotes(tenantId, { quotes: [xeroQuote] });
      return response.body.quotes?.[0];
    });
  }

  async disconnectIntegration(orgId: string) {
    return await db
      .update(orgIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, 'xero'),
      ));
  }
}

export const xeroService = new XeroService();
