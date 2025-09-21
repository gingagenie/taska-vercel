/**
 * Facebook Pixel TypeScript Definitions
 * 
 * Provides type safety for Facebook Pixel integration in React TypeScript applications.
 */

export interface FacebookPixel {
  (command: 'init', pixelId: string): void;
  (command: 'track', event: StandardEvent, parameters?: EventParameters): void;
  (command: 'trackCustom', event: string, parameters?: EventParameters): void;
  push: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
  queue?: unknown[];
}

export type StandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase'
  | 'Lead'
  | 'CompleteRegistration'
  | 'Contact'
  | 'CustomizeProduct'
  | 'Donate'
  | 'FindLocation'
  | 'Schedule'
  | 'StartTrial'
  | 'SubmitApplication'
  | 'Subscribe';

export interface EventParameters {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  contents?: Array<{
    id: string;
    quantity: number;
  }>;
  num_items?: number;
  search_string?: string;
  status?: string;
  subscription_id?: string;
  predicted_ltv?: number;
  [key: string]: unknown;
}

// Custom events specific to Taska business model
export type TaskaCustomEvent =
  | 'JobCreated'
  | 'CustomerAdded'
  | 'InvoiceGenerated'
  | 'EquipmentAdded'
  | 'QuoteCreated'
  | 'TeamMemberInvited'
  | 'SupportTicketCreated';

// Extend global Window interface
declare global {
  interface Window {
    fbq: FacebookPixel;
  }
}

export {};