/**
 * Secure Token Storage for iOS Authentication
 * 
 * This module provides secure storage for JWT tokens on iOS using
 * @aparajita/capacitor-secure-storage which leverages iOS Keychain.
 * 
 * SECURITY FEATURES:
 * - iOS Keychain storage (hardware-backed when available)
 * - Automatic fallback for non-iOS platforms (no-op)
 * - Secure token clearing on logout
 * - Error handling with graceful degradation
 */

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isIOSCapacitor } from './platform-detection';

// Storage keys for different token types
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'taska_access_token',
  REFRESH_TOKEN: 'taska_refresh_token',
  TOKEN_EXPIRY: 'taska_token_expiry',
  USER_ID: 'taska_user_id',
  ORG_ID: 'taska_org_id'
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  userId: string;
  orgId?: string;
}

/**
 * Check if secure storage is available and should be used
 */
export function isSecureStorageAvailable(): boolean {
  return isIOSCapacitor();
}

/**
 * Store authentication tokens securely (iOS only)
 */
export async function storeTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds from now
  userId: string;
  orgId?: string;
}): Promise<void> {
  if (!isSecureStorageAvailable()) {
    console.log('[SECURE STORAGE] Not available on this platform, skipping token storage');
    return;
  }

  try {
    const expiresAt = Date.now() + (tokens.expiresIn * 1000);
    
    console.log('[SECURE STORAGE] Storing tokens for iOS user:', tokens.userId);
    
    // Store all tokens and metadata
    await Promise.all([
      SecureStorage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken),
      SecureStorage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
      SecureStorage.set(STORAGE_KEYS.TOKEN_EXPIRY, expiresAt.toString()),
      SecureStorage.set(STORAGE_KEYS.USER_ID, tokens.userId),
      tokens.orgId ? SecureStorage.set(STORAGE_KEYS.ORG_ID, tokens.orgId) : Promise.resolve()
    ]);
    
    console.log('[SECURE STORAGE] Tokens stored successfully');
  } catch (error) {
    console.error('[SECURE STORAGE] Error storing tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Retrieve stored authentication tokens (iOS only)
 */
export async function getStoredTokens(): Promise<StoredTokens | null> {
  if (!isSecureStorageAvailable()) {
    console.log('[SECURE STORAGE] Not available on this platform, no tokens to retrieve');
    return null;
  }

  try {
    console.log('[SECURE STORAGE] Retrieving stored tokens');
    
    // Retrieve all stored values
    const [accessToken, refreshToken, expiryStr, userId, orgId] = await Promise.all([
      SecureStorage.get(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStorage.get(STORAGE_KEYS.REFRESH_TOKEN),
      SecureStorage.get(STORAGE_KEYS.TOKEN_EXPIRY),
      SecureStorage.get(STORAGE_KEYS.USER_ID),
      SecureStorage.get(STORAGE_KEYS.ORG_ID).catch(() => null) // Optional field
    ]);

    // Check if we have the required tokens
    if (!accessToken || !refreshToken || !expiryStr || !userId) {
      console.log('[SECURE STORAGE] Incomplete token data found, clearing storage');
      await clearStoredTokens();
      return null;
    }

    const expiresAt = parseInt(expiryStr, 10);
    
    const tokens: StoredTokens = {
      accessToken,
      refreshToken,
      expiresAt,
      userId,
      orgId: orgId || undefined
    };

    console.log('[SECURE STORAGE] Tokens retrieved successfully for user:', userId);
    return tokens;
  } catch (error) {
    console.error('[SECURE STORAGE] Error retrieving tokens:', error);
    // Clear potentially corrupted storage
    await clearStoredTokens();
    return null;
  }
}

/**
 * Update stored access token after refresh (iOS only)
 */
export async function updateAccessToken(accessToken: string, expiresIn: number): Promise<void> {
  if (!isSecureStorageAvailable()) {
    console.log('[SECURE STORAGE] Not available on this platform, skipping token update');
    return;
  }

  try {
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    console.log('[SECURE STORAGE] Updating access token');
    
    await Promise.all([
      SecureStorage.set(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
      SecureStorage.set(STORAGE_KEYS.TOKEN_EXPIRY, expiresAt.toString())
    ]);
    
    console.log('[SECURE STORAGE] Access token updated successfully');
  } catch (error) {
    console.error('[SECURE STORAGE] Error updating access token:', error);
    throw new Error('Failed to update access token');
  }
}

/**
 * Update both access and refresh tokens after refresh (iOS only)
 */
export async function updateBothTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  if (!isSecureStorageAvailable()) {
    console.log('[SECURE STORAGE] Not available on this platform, skipping token update');
    return;
  }

  try {
    const expiresAt = Date.now() + (tokens.expiresIn * 1000);
    
    console.log('[SECURE STORAGE] Updating both tokens');
    
    await Promise.all([
      SecureStorage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken),
      SecureStorage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
      SecureStorage.set(STORAGE_KEYS.TOKEN_EXPIRY, expiresAt.toString())
    ]);
    
    console.log('[SECURE STORAGE] Both tokens updated successfully');
  } catch (error) {
    console.error('[SECURE STORAGE] Error updating tokens:', error);
    throw new Error('Failed to update tokens');
  }
}

/**
 * Check if the stored access token is expired
 */
export async function isAccessTokenExpired(): Promise<boolean> {
  if (!isSecureStorageAvailable()) {
    return true; // Consider expired if storage not available
  }

  try {
    const expiryStr = await SecureStorage.get(STORAGE_KEYS.TOKEN_EXPIRY);
    if (!expiryStr) {
      return true;
    }

    const expiresAt = parseInt(expiryStr, 10);
    const now = Date.now();
    
    // Consider expired if within 1 minute of expiry (buffer for network calls)
    const isExpired = (expiresAt - now) < 60000;
    
    if (isExpired) {
      console.log('[SECURE STORAGE] Access token is expired or expiring soon');
    }
    
    return isExpired;
  } catch (error) {
    console.error('[SECURE STORAGE] Error checking token expiry:', error);
    return true; // Consider expired on error
  }
}

/**
 * Get the current access token if valid (iOS only)
 */
export async function getCurrentAccessToken(): Promise<string | null> {
  if (!isSecureStorageAvailable()) {
    return null;
  }

  try {
    const isExpired = await isAccessTokenExpired();
    if (isExpired) {
      console.log('[SECURE STORAGE] Access token expired, returning null');
      return null;
    }

    const accessToken = await SecureStorage.get(STORAGE_KEYS.ACCESS_TOKEN);
    return accessToken || null;
  } catch (error) {
    console.error('[SECURE STORAGE] Error getting current access token:', error);
    return null;
  }
}

/**
 * Get the refresh token for token renewal (iOS only)
 */
export async function getRefreshToken(): Promise<string | null> {
  if (!isSecureStorageAvailable()) {
    return null;
  }

  try {
    const refreshToken = await SecureStorage.get(STORAGE_KEYS.REFRESH_TOKEN);
    return refreshToken || null;
  } catch (error) {
    console.error('[SECURE STORAGE] Error getting refresh token:', error);
    return null;
  }
}

/**
 * Clear all stored authentication tokens (iOS only)
 */
export async function clearStoredTokens(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    console.log('[SECURE STORAGE] Not available on this platform, no tokens to clear');
    return;
  }

  try {
    console.log('[SECURE STORAGE] Clearing all stored tokens');
    
    // Clear all stored values
    await Promise.all([
      SecureStorage.remove(STORAGE_KEYS.ACCESS_TOKEN).catch(() => {}),
      SecureStorage.remove(STORAGE_KEYS.REFRESH_TOKEN).catch(() => {}),
      SecureStorage.remove(STORAGE_KEYS.TOKEN_EXPIRY).catch(() => {}),
      SecureStorage.remove(STORAGE_KEYS.USER_ID).catch(() => {}),
      SecureStorage.remove(STORAGE_KEYS.ORG_ID).catch(() => {})
    ]);
    
    console.log('[SECURE STORAGE] All tokens cleared successfully');
  } catch (error) {
    console.error('[SECURE STORAGE] Error clearing tokens:', error);
    // Don't throw here - clearing should be best effort
  }
}

/**
 * Get debug information about stored tokens (without exposing actual tokens)
 */
export async function getTokenDebugInfo(): Promise<Record<string, any>> {
  if (!isSecureStorageAvailable()) {
    return {
      available: false,
      platform: 'non-ios',
      reason: 'Secure storage only available on iOS Capacitor'
    };
  }

  try {
    const [expiryStr, userId, orgId] = await Promise.all([
      SecureStorage.get(STORAGE_KEYS.TOKEN_EXPIRY).catch(() => null),
      SecureStorage.get(STORAGE_KEYS.USER_ID).catch(() => null),
      SecureStorage.get(STORAGE_KEYS.ORG_ID).catch(() => null)
    ]);

    const hasAccessToken = !!(await SecureStorage.get(STORAGE_KEYS.ACCESS_TOKEN).catch(() => null));
    const hasRefreshToken = !!(await SecureStorage.get(STORAGE_KEYS.REFRESH_TOKEN).catch(() => null));

    return {
      available: true,
      platform: 'ios',
      hasAccessToken,
      hasRefreshToken,
      hasExpiry: !!expiryStr,
      hasUserId: !!userId,
      hasOrgId: !!orgId,
      expiresAt: expiryStr ? new Date(parseInt(expiryStr, 10)).toISOString() : null,
      isExpired: expiryStr ? await isAccessTokenExpired() : null,
      userId: userId || null,
      orgId: orgId || null
    };
  } catch (error) {
    return {
      available: true,
      platform: 'ios',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}