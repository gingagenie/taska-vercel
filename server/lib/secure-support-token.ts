import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Secure Support Token System
 * 
 * Replaces the forgeable boolean `support_marker=true` cookie with a cryptographically
 * signed token that prevents privilege escalation attacks.
 */

// Token expiration time (2 hours)
const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1000;

// SECURITY FIX: Fail closed in production if secret missing
const SIGNING_SECRET = process.env.SUPPORT_TOKEN_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY] CRITICAL: SUPPORT_TOKEN_SECRET environment variable is required in production');
    console.error('[SECURITY] BLOCKING STARTUP: Cannot generate secure support tokens without cryptographic secret');
    throw new Error('SUPPORT_TOKEN_SECRET environment variable is required in production. Set this to a cryptographically strong secret.');
  }
  // Development fallback only
  console.warn('[SECURITY] WARNING: Using development-only default secret. Set SUPPORT_TOKEN_SECRET in production.');
  return 'dev-support-secret-change-in-production';
})();

export interface SupportTokenPayload {
  supportUserId: string;
  role: string; // 'support_user' or 'support_admin'
  issuedAt: number;
  expiresAt: number;
}

/**
 * Generate a secure, tamper-proof support token
 * This token can safely be sent to browsers without security risk
 */
export function generateSupportToken(supportUserId: string, role: string): string {
  const now = Date.now();
  const payload: SupportTokenPayload = {
    supportUserId,
    role,
    issuedAt: now,
    expiresAt: now + TOKEN_EXPIRATION_MS
  };

  // Create payload string
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64url');

  // Generate HMAC signature
  const hmac = createHmac('sha256', SIGNING_SECRET);
  hmac.update(payloadBase64);
  const signature = hmac.digest('base64url');

  // Combine payload and signature
  const token = `${payloadBase64}.${signature}`;
  
  console.log(`[SUPPORT_TOKEN] Generated secure token for ${supportUserId} (${role}) expires ${new Date(payload.expiresAt).toISOString()}`);
  
  return token;
}

/**
 * Verify a support token and extract payload
 * Returns null if token is invalid, expired, or tampered with
 */
export function verifySupportToken(token: string): SupportTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Split token into payload and signature
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.log('[SUPPORT_TOKEN] Invalid token format: missing parts');
      return null;
    }

    const [payloadBase64, providedSignature] = parts;

    // Verify signature
    const hmac = createHmac('sha256', SIGNING_SECRET);
    hmac.update(payloadBase64);
    const expectedSignature = hmac.digest('base64url');

    // Use timing-safe comparison to prevent timing attacks
    const providedSigBuffer = Buffer.from(providedSignature, 'base64url');
    const expectedSigBuffer = Buffer.from(expectedSignature, 'base64url');
    
    if (providedSigBuffer.length !== expectedSigBuffer.length || !timingSafeEqual(providedSigBuffer, expectedSigBuffer)) {
      console.log('[SUPPORT_TOKEN] Invalid token signature - possible forgery attempt');
      return null;
    }

    // Decode and parse payload
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as SupportTokenPayload;

    // Validate payload structure
    if (!payload.supportUserId || !payload.role || !payload.issuedAt || !payload.expiresAt) {
      console.log('[SUPPORT_TOKEN] Invalid token payload structure');
      return null;
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      console.log(`[SUPPORT_TOKEN] Token expired for ${payload.supportUserId} (expired ${new Date(payload.expiresAt).toISOString()})`);
      return null;
    }

    // Validate role
    const validRoles = ['support_user', 'support_admin'];
    if (!validRoles.includes(payload.role)) {
      console.log(`[SUPPORT_TOKEN] Invalid role in token: ${payload.role}`);
      return null;
    }

    // Token is valid
    console.log(`[SUPPORT_TOKEN] Valid token verified for ${payload.supportUserId} (${payload.role}) expires ${new Date(payload.expiresAt).toISOString()}`);
    return payload;

  } catch (error) {
    console.log(`[SUPPORT_TOKEN] Token verification error: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }
}

/**
 * Check if a token is close to expiring (within 30 minutes)
 * Use this to prompt token refresh
 */
export function isTokenNearExpiry(payload: SupportTokenPayload): boolean {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  return (payload.expiresAt - now) < thirtyMinutes;
}

/**
 * Extract just the user ID from a token without full verification
 * Use this only for logging purposes - never for authorization
 */
export function extractUserIdForLogging(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    
    const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return payload.supportUserId || null;
  } catch {
    return null;
  }
}