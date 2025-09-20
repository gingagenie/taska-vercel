/**
 * Platform Detection Utilities for Hybrid Authentication
 * 
 * This module provides platform detection specifically for determining
 * whether to use JWT tokens (iOS only) or session cookies (web/Android).
 * 
 * CRITICAL: Only iOS Capacitor apps should use JWT tokens.
 * Everything else (web, Android, iOS web) uses session cookies.
 */

import { Capacitor } from '@capacitor/core';

// Kill switch: Force all platforms to use cookie mode
const FORCE_COOKIE_MODE = import.meta.env.VITE_FORCE_COOKIE_MODE === 'true';

// Enhanced platform detection results
export interface PlatformInfo {
  platform: 'ios' | 'android' | 'web';
  isCapacitor: boolean;
  isIOSCapacitor: boolean;
  shouldUseTokenAuth: boolean;
  authMode: 'token' | 'cookie';
  userAgent: string;
  capacitorVersion?: string;
}

/**
 * Detect the current platform and determine authentication mode
 * 
 * AUTHENTICATION LOGIC:
 * - iOS Capacitor app: Use JWT tokens 
 * - Everything else: Use session cookies
 */
export function detectPlatform(): PlatformInfo {
  // Get basic environment info
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isCapacitor = Capacitor.isNativePlatform();
  const capacitorPlatform = Capacitor.getPlatform();
  
  // Determine if this is specifically iOS Capacitor
  const isIOSCapacitor = isCapacitor && capacitorPlatform === 'ios';
  
  // Kill switch: Force cookie mode for all platforms if enabled
  if (FORCE_COOKIE_MODE) {
    console.log('[PLATFORM] Force cookie mode enabled - all platforms will use session cookies');
    return {
      platform: capacitorPlatform as any || 'web',
      isCapacitor,
      isIOSCapacitor,
      shouldUseTokenAuth: false,
      authMode: 'cookie',
      userAgent,
      capacitorVersion: Capacitor.convertFileSrc ? 'modern' : 'legacy'
    };
  }
  
  // Determine authentication mode based on platform
  const shouldUseTokenAuth = isIOSCapacitor;
  const authMode = shouldUseTokenAuth ? 'token' : 'cookie';
  
  const platformInfo: PlatformInfo = {
    platform: (capacitorPlatform as any) || 'web',
    isCapacitor,
    isIOSCapacitor,
    shouldUseTokenAuth,
    authMode,
    userAgent,
    capacitorVersion: Capacitor.convertFileSrc ? 'modern' : 'legacy'
  };

  // Log platform detection results for debugging
  console.log('[PLATFORM] Platform detection results:', {
    platform: platformInfo.platform,
    isCapacitor: platformInfo.isCapacitor,
    isIOSCapacitor: platformInfo.isIOSCapacitor,
    authMode: platformInfo.authMode,
    shouldUseTokenAuth: platformInfo.shouldUseTokenAuth,
    capacitorVersion: platformInfo.capacitorVersion,
    userAgent: userAgent.substring(0, 50) + '...'
  });

  return platformInfo;
}

/**
 * Simple check if the current platform should use JWT token authentication
 * This is the primary function most components should use
 */
export function shouldUseTokenAuth(): boolean {
  if (FORCE_COOKIE_MODE) {
    return false;
  }
  
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Get the auth mode for API requests
 * Returns 'token' for iOS Capacitor, 'cookie' for everything else
 */
export function getAuthMode(): 'token' | 'cookie' {
  return shouldUseTokenAuth() ? 'token' : 'cookie';
}

/**
 * Get the X-Auth-Mode header value for server communication
 * This helps the server identify the client's intended auth mode
 */
export function getAuthModeHeader(): string {
  return getAuthMode();
}

/**
 * Check if we're running in a Capacitor environment (iOS or Android)
 */
export function isCapacitorApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if we're specifically in iOS Capacitor environment
 */
export function isIOSCapacitor(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Check if we're specifically in Android Capacitor environment
 */
export function isAndroidCapacitor(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Check if we're running in a web browser (not Capacitor)
 */
export function isWebBrowser(): boolean {
  return !Capacitor.isNativePlatform();
}

/**
 * Get a human-readable platform description for logging/debugging
 */
export function getPlatformDescription(): string {
  const info = detectPlatform();
  
  if (info.isIOSCapacitor) {
    return `iOS Capacitor App (${info.authMode} auth)`;
  } else if (info.isCapacitor && info.platform === 'android') {
    return `Android Capacitor App (${info.authMode} auth)`;
  } else {
    return `Web Browser (${info.authMode} auth)`;
  }
}

/**
 * Emergency kill switch checker
 * Returns true if all clients should be forced to use cookie auth
 */
export function isCookieModeForced(): boolean {
  return FORCE_COOKIE_MODE;
}

/**
 * Get platform-specific configuration for debugging
 */
export function getPlatformDebugInfo(): Record<string, any> {
  const info = detectPlatform();
  
  return {
    ...info,
    forceCookieMode: FORCE_COOKIE_MODE,
    environment: import.meta.env.MODE,
    timestamp: new Date().toISOString(),
    location: typeof window !== 'undefined' ? window.location.href : 'server-side'
  };
}