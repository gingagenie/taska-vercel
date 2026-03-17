import { XeroClient } from 'xero-node';
import { Invoice, Quote, Contact, Payment } from 'xero-node';
import { db } from '../db/client';
import { orgIntegrations } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export class XeroService {
  private client: XeroClient | null = null;

  constructor() {
    if (process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET) {
      this.client = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID,
        clientSecret: process.env.XERO_CLIENT_SECRET,
        redirectUris: ['https://taska.info/api/xero/callback'],
        scopes: ['openid', 'profile', 'email', 'accounting.transactions', 'accounting.settings'],
      });
    }
  }

  private ensureClient() {
    if (!this.client) {
      throw new Error('Xero credentials not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables.');
    }
    return this.client;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getAuthUrl(state: string): Promise<string> {
    this.ensureClient();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.XERO_CLIENT_ID!,
      redirect_uri: 'https://taska.info/api/xero/callback',
      scope: 'openid profile email accounting.transactions accounting.settings',
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, orgId: string) {
    const client = this.ensureClient();
    console.log('Xero callback: Processing code:', code.substring(0, 20) + '...');

    const callbackUrl = `https://taska.info/api/xero/callback?code=${code}`;
    const tokenSet = await client.apiCallback(callbackUrl);
    console.log('Xero callback: Token set received:', !!tokenSet.access_token);

    if (!tokenSet.access_token) {
      throw new Error('Failed to get access token from Xero');
    }

    console.log('Xero callback: Updating tenants...');
    try {
      await client.updateTenants();
    } catch (tenantError: any) {
      console.error('Xero callback: updateTenants failed:', JSON.stringify(tenantError));
      throw tenantError;
    }

    const activeTenant = client.tenants[0];
    if (!activeTenant) {
      throw new Error('No Xero tenants available');
    }

    const integration = {
      orgId,
      provider: 'xero' as const,
      accessToken: tokenSet.access_token || null,
      refreshToken: tokenSet.refresh_token || null,
      tokenExpiresAt: new Date(Date.now() + (tokenSet.expires_in || 1800) * 1000),
      tenantId: activeTenant.tenantId || null,
      tenantName: activeTenant.tenantName || null,
      isActive: true,
    };

    const existingIntegration = await db
      .select()
      .from(orgIntegrations)
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, 'xero')
      ))
      .limit(1);

    if (existingIntegration.length > 0) {
      await db
        .update(orgIntegrations)
        .set({ ...integration, updatedAt: new Date() })
        .where(eq(orgIntegrations.id, existingIntegration[0].id));
    } else {
      await db.insert(orgIntegrations).values(integration);
    }

    return { tenantName: activeTenant.tenantName, tenantId: activeTenant.tenantId };
  }

  async getOrgIntegration(orgId: string) {
    const integration = await db
      .select()
      .from(orgIntegrations)
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, 'xero'),
        eq(orgIntegrations.isActive, true)
      ))
      .limit(1);

    return integration[0] || null;
  }

  /**
   * Hydrates the xero-node client from DB tokens, refreshes if needed,
   * then calls updateTenants() with a valid token.
   * Always call this before any Xero API request.
   */
  async refreshTokensIfNeeded(orgId: string) {
    const integration = await this.getOrgIntegration(orgId);
    if (!integration) return null;

    const client = this.ensureClient();

    // Step 1: Always hydrate client from DB — Railway is stateless,
    // the singleton XeroClient loses its token on every cold start.
    client.setTokenSet({
      access_token: integration.accessToken || undefined,
      refresh_token: integration.refreshToken || undefined,
    });

    // Step 2: Refresh token if expired or expiring within 5 minutes.
    // Do this BEFORE calling updateTenants so we always have a valid token.
    const now = new Date();
    const expiresAt = new Date(integration.tokenExpiresAt || 0);
    const needsRefresh = now >= new Date(expiresAt.getTime() - 5 * 60 * 1000);

    if (needsRefresh && integration.refreshToken) {
      try {
        console.log('[Xero] Access token expired or expiring soon, refreshing...');
        const newTokenSet = await client.refreshToken();

        await db
          .update(orgIntegrations)
          .set({
            accessToken: newTokenSet.access_token || null,
            refreshToken: newTokenSet.refresh_token || null,
            tokenExpiresAt: new Date(Date.now() + (newTokenSet.expires_in || 1800) * 1000),
            updatedAt: new Date(),
          })
          .where(eq(orgIntegrations.id, integration.id));

        // Update in-memory token set with fresh tokens
        client.setTokenSet({
          access_token: newTokenSet.access_token || undefined,
          refresh_token: newTokenSet.refresh_token || undefined,
        });

        integration.accessToken = newTokenSet.access_token || null;
        integration.refreshToken = newTokenSet.refresh_token || null;

        console.log('[Xero] Token refreshed successfully');
      } catch (error) {
        console.error('[Xero] Token refresh failed:', error);
        // Mark inactive so user gets a clean "reconnect" prompt
        await db
          .update(orgIntegrations)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(orgIntegrations.id, integration.id));
        return null;
      }
    }

    // Step 3: Restore tenants AFTER we have a valid token.
    // updateTenants() makes a live API call — must have a non-expired token.
    try {
      await client.updateTenants();
    } catch (error) {
      console.error('[Xero] updateTenants failed:', error);
      // If we can't fetch tenants, mark inactive
      await db
        .update(orgIntegrations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(orgIntegrations.id, integration.id));
      return null;
    }

    return integration;
  }

  async getAccounts(orgId: string) {
    const integration = await this.refreshTokensIfNeeded(orgId);
    if (!integration) {
      throw new Error('Xero integration not found or tokens expired');
    }

    const client = this.ensureClient();
    const response = await client.accountingApi.getAccounts(
      integration.tenantId || ''
    );

    return (response.body.accounts || []).map((a: any) => ({
      code: a.code,
      name: a.name,
      type: a.type,
    }));
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
    const integration = await this.refreshTokensIfNeeded(orgId);
    if (!integration) {
      throw new Error('Xero integration not found or tokens expired');
    }

    const { db: dbClient } = await import('../db/client');
    const { sql } = await import('drizzle-orm');
    const result: any = await dbClient.execute(sql`
      SELECT xero_payment_account_code FROM org_integrations WHERE id = ${integration.id}::uuid
    `);
    const accountCode = result[0]?.xero_payment_account_code;

    if (!accountCode) {
      throw new Error('No Xero payment account configured. Set one in Settings → Integrations.');
    }

    const client = this.ensureClient();

    const payment: Payment = {
      invoice: { invoiceID: xeroInvoiceId },
      account: { code: accountCode },
      amount,
      date,
    };

    const response = await client.accountingApi.createPayment(
      integration.tenantId || '',
      payment
    );

    return response.body.payments?.[0];
  }

  /**
   * Creates an invoice in Xero as a DRAFT.
   * Passes Taska's invoice number as the Xero InvoiceNumber so both
   * systems stay in sync (e.g. INV-0042 in Taska = INV-0042 in Xero).
   */
  async createInvoiceInXero(orgId: string, invoiceData: any) {
    const integration = await this.refreshTokensIfNeeded(orgId);
    if (!integration) {
      throw new Error('Xero integration not found or tokens expired');
    }

    const client = this.ensureClient();

    const contact: Contact = {
      name: invoiceData.customerName,
      emailAddress: invoiceData.customerEmail,
    };

    const xeroInvoice: Invoice = {
      type: Invoice.TypeEnum.ACCREC,
      contact,
      invoiceNumber: invoiceData.invoiceNumber || undefined,
      reference: invoiceData.invoiceNumber || undefined,
      lineItems: invoiceData.items.map((item: any) => ({
        description: item.name || item.description,
        quantity: item.quantity || 1,
        unitAmount: parseFloat(item.price || '0'),
      })),
      date: new Date().toISOString().split('T')[0],
      dueDate: invoiceData.dueAt ? new Date(invoiceData.dueAt).toISOString().split('T')[0] : undefined,
      status: Invoice.StatusEnum.DRAFT,
      currencyCode: invoiceData.currency || 'AUD',
    };

    const response = await client.accountingApi.createInvoices(
      integration.tenantId || '',
      { invoices: [xeroInvoice] }
    );

    return response.body.invoices?.[0];
  }

  async createQuoteInXero(orgId: string, quoteData: any) {
    const integration = await this.refreshTokensIfNeeded(orgId);
    if (!integration) {
      throw new Error('Xero integration not found or tokens expired');
    }

    const client = this.ensureClient();

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
      status: Quote.StatusEnum.DRAFT,
      currencyCode: quoteData.currency || 'AUD',
      title: quoteData.title,
    };

    const response = await client.accountingApi.createQuotes(
      integration.tenantId || '',
      { quotes: [xeroQuote] }
    );

    return response.body.quotes?.[0];
  }

  async disconnectIntegration(orgId: string) {
    return await db
      .update(orgIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, 'xero')
      ));
  }
}

export const xeroService = new XeroService();
