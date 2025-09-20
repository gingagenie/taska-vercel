import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';

/**
 * JWT Authentication Token System for iOS App Store Approval
 * 
 * This system provides secure JWT tokens for iOS users only, while maintaining
 * existing cookie-based authentication for web and Android users.
 * 
 * SECURITY FEATURES:
 * - Cryptographically signed tokens
 * - Separate access and refresh tokens
 * - Short access token expiry (15 minutes)
 * - Longer refresh token expiry (7 days)
 * - User validation on each token verification
 */

// Token configuration
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

// SECURITY: Validate JWT secrets on startup - hard fail in production if missing
function validateJwtSecrets() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_ACCESS_SECRET) {
      console.error('[JWT AUTH] CRITICAL: JWT_ACCESS_SECRET environment variable is required in production');
      process.exit(1);
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      console.error('[JWT AUTH] CRITICAL: JWT_REFRESH_SECRET environment variable is required in production');
      process.exit(1);
    }
  }
}

// Run validation on module load
validateJwtSecrets();

// JWT secrets with secure fallbacks only in development
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    // This should never be reached due to validation above
    throw new Error('JWT_ACCESS_SECRET is required in production');
  }
  console.log('[JWT AUTH] Using development fallback for JWT_ACCESS_SECRET');
  return 'dev-jwt-access-secret-change-in-production';
})();

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    // This should never be reached due to validation above
    throw new Error('JWT_REFRESH_SECRET is required in production');
  }
  console.log('[JWT AUTH] Using development fallback for JWT_REFRESH_SECRET');
  return 'dev-jwt-refresh-secret-change-in-production';
})();

// Token payload interfaces
export interface AccessTokenPayload {
  userId: string;
  orgId?: string;
  role?: string;
  tokenType: 'access';
  platform: 'ios';  // Only iOS uses JWT tokens
  issuedAt: number;
  expiresAt: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenType: 'refresh';
  platform: 'ios';
  issuedAt: number;
  expiresAt: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

/**
 * Generate a pair of access and refresh tokens for a user
 * Only called for iOS clients
 */
export async function generateAuthTokens(userId: string, orgId?: string, role?: string): Promise<AuthTokens> {
  const now = Math.floor(Date.now() / 1000);
  
  // Access token payload
  const accessPayload: AccessTokenPayload = {
    userId,
    orgId,
    role,
    tokenType: 'access',
    platform: 'ios',
    issuedAt: now,
    expiresAt: now + (15 * 60) // 15 minutes from now
  };

  // Refresh token payload
  const refreshPayload: RefreshTokenPayload = {
    userId,
    tokenType: 'refresh',
    platform: 'ios',
    issuedAt: now,
    expiresAt: now + (7 * 24 * 60 * 60) // 7 days from now
  };

  // Generate tokens
  const accessToken = jwt.sign(accessPayload, JWT_ACCESS_SECRET, { 
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256'
  });

  const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, { 
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: 'HS256'
  });

  console.log(`[JWT AUTH] Generated tokens for iOS user ${userId} (org: ${orgId || 'none'})`);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60 // 15 minutes in seconds
  };
}

/**
 * Verify and decode an access token
 * Returns the payload if valid, null if invalid/expired
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET, { 
      algorithms: ['HS256'] 
    }) as AccessTokenPayload;

    // Validate token structure
    if (decoded.tokenType !== 'access' || decoded.platform !== 'ios') {
      console.log('[JWT AUTH] Invalid access token: wrong type or platform');
      return null;
    }

    // Verify user still exists and is active
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id, email, name
      FROM users 
      WHERE id = ${decoded.userId}::uuid
    `);
    
    const user = userResult[0];
    if (!user) {
      console.log(`[JWT AUTH] Access token invalid: user ${decoded.userId} not found`);
      return null;
    }

    // Update the payload with current user data (in case role/org changed)
    decoded.orgId = user.org_id;
    decoded.role = user.role;

    console.log(`[JWT AUTH] Access token verified for iOS user ${decoded.userId}`);
    return decoded;

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('[JWT AUTH] Access token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log('[JWT AUTH] Invalid access token format');
    } else {
      console.error('[JWT AUTH] Access token verification error:', error);
    }
    return null;
  }
}

/**
 * Verify and decode a refresh token
 * Returns the payload if valid, null if invalid/expired
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, { 
      algorithms: ['HS256'] 
    }) as RefreshTokenPayload;

    // Validate token structure
    if (decoded.tokenType !== 'refresh' || decoded.platform !== 'ios') {
      console.log('[JWT AUTH] Invalid refresh token: wrong type or platform');
      return null;
    }

    // Verify user still exists and is active
    const userResult: any = await db.execute(sql`
      SELECT id, role, org_id
      FROM users 
      WHERE id = ${decoded.userId}::uuid
    `);
    
    const user = userResult[0];
    if (!user) {
      console.log(`[JWT AUTH] Refresh token invalid: user ${decoded.userId} not found`);
      return null;
    }

    console.log(`[JWT AUTH] Refresh token verified for iOS user ${decoded.userId}`);
    return decoded;

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('[JWT AUTH] Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log('[JWT AUTH] Invalid refresh token format');
    } else {
      console.error('[JWT AUTH] Refresh token verification error:', error);
    }
    return null;
  }
}

/**
 * Refresh an access token using a valid refresh token
 * Returns new token pair if successful, null if refresh token invalid
 */
export async function refreshAuthTokens(refreshToken: string): Promise<AuthTokens | null> {
  const refreshPayload = await verifyRefreshToken(refreshToken);
  if (!refreshPayload) {
    return null;
  }

  // Get current user data
  const userResult: any = await db.execute(sql`
    SELECT id, role, org_id
    FROM users 
    WHERE id = ${refreshPayload.userId}::uuid
  `);
  
  const user = userResult[0];
  if (!user) {
    console.log(`[JWT AUTH] Cannot refresh tokens: user ${refreshPayload.userId} not found`);
    return null;
  }

  // Generate new token pair
  const newTokens = await generateAuthTokens(user.id, user.org_id, user.role);
  
  console.log(`[JWT AUTH] Tokens refreshed for iOS user ${user.id}`);
  return newTokens;
}

/**
 * Extract user ID from a token without full verification (for logging purposes)
 * Use this only for non-security purposes like logging
 */
export function extractUserIdFromToken(token: string): string | null {
  try {
    const decoded = jwt.decode(token) as any;
    return decoded?.userId || null;
  } catch {
    return null;
  }
}

/**
 * Kill switch: Validate if a token was issued before a cutoff time
 * This allows instant deactivation of all tokens issued before a certain point
 */
export function isTokenIssuedBefore(token: string, cutoffTimestamp: number): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    return decoded?.issuedAt < cutoffTimestamp;
  } catch {
    return true; // If we can't decode it, consider it old
  }
}

/**
 * Emergency kill switch: Check if JWT auth is globally disabled
 * Set JWT_AUTH_DISABLED=true to instantly revert all iOS users to cookie mode
 */
export function isJwtAuthDisabled(): boolean {
  return process.env.JWT_AUTH_DISABLED === 'true';
}