/**
 * Authentication Debugging and Safety Utilities
 * 
 * This module provides extensive debugging capabilities and safety features
 * for the hybrid authentication system, including a kill switch to instantly
 * revert to cookie-only authentication.
 */

import { detectPlatform, shouldUseTokenAuth, getPlatformDescription } from './platform-detection';
import { getTokenDebugInfo } from './secure-token-storage';

// Kill Switch Environment Variable Check
const JWT_AUTH_DISABLED = import.meta.env.VITE_JWT_AUTH_DISABLED === 'true';

/**
 * Check if JWT authentication is globally disabled via kill switch
 */
export function isJWTAuthDisabled(): boolean {
  return JWT_AUTH_DISABLED;
}

/**
 * Enhanced platform detection with kill switch override
 */
export function getEffectiveAuthMode(): 'token' | 'cookie' {
  if (isJWTAuthDisabled()) {
    console.log('[AUTH DEBUG] 🔴 JWT authentication disabled via kill switch (VITE_JWT_AUTH_DISABLED=true)');
    return 'cookie';
  }

  const shouldUseToken = shouldUseTokenAuth();
  const mode = shouldUseToken ? 'token' : 'cookie';
  
  console.log(`[AUTH DEBUG] 🔍 Auth mode determined: ${mode} for platform: ${getPlatformDescription()}`);
  
  return mode;
}

/**
 * Comprehensive authentication state debugging
 */
export async function getAuthDebugInfo(): Promise<Record<string, any>> {
  const platform = detectPlatform();
  const effectiveAuthMode = getEffectiveAuthMode();
  const tokenDebugInfo = await getTokenDebugInfo();
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    platform: {
      ...platform,
      description: getPlatformDescription(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A'
    },
    authentication: {
      killSwitchActive: isJWTAuthDisabled(),
      recommendedMode: shouldUseTokenAuth() ? 'token' : 'cookie',
      effectiveMode: effectiveAuthMode,
      modeOverridden: isJWTAuthDisabled() && shouldUseTokenAuth()
    },
    tokens: tokenDebugInfo,
    environment: {
      jwtAuthDisabled: JWT_AUTH_DISABLED,
      isDevelopment: import.meta.env.DEV,
      mode: import.meta.env.MODE
    },
    capabilities: {
      localStorage: typeof window !== 'undefined' && !!window.localStorage,
      sessionStorage: typeof window !== 'undefined' && !!window.sessionStorage,
      capacitor: typeof window !== 'undefined' && !!(window as any).Capacitor,
      secureStorage: tokenDebugInfo.available
    }
  };

  return debugInfo;
}

/**
 * Log comprehensive authentication diagnostics
 */
export async function logAuthDiagnostics(): Promise<void> {
  try {
    const debugInfo = await getAuthDebugInfo();
    
    console.group('[AUTH DIAGNOSTICS] 🔍 Authentication System Status');
    console.log('📱 Platform:', debugInfo.platform.description);
    console.log('🔐 Auth Mode:', debugInfo.authentication.effectiveMode);
    console.log('🔒 JWT Disabled:', debugInfo.authentication.killSwitchActive);
    console.log('⚡ Mode Overridden:', debugInfo.authentication.modeOverridden);
    
    if (debugInfo.authentication.effectiveMode === 'token') {
      console.log('🎫 Token Status:', debugInfo.tokens.hasAccessToken ? '✅ Present' : '❌ Missing');
      console.log('🔄 Refresh Token:', debugInfo.tokens.hasRefreshToken ? '✅ Present' : '❌ Missing');
      console.log('⏰ Token Expired:', debugInfo.tokens.isExpired ? '⚠️ Yes' : '✅ No');
    }
    
    console.log('🛠️ Full Debug Data:', debugInfo);
    console.groupEnd();
  } catch (error) {
    console.error('[AUTH DIAGNOSTICS] Error generating diagnostics:', error);
  }
}

/**
 * Validate authentication configuration
 */
export async function validateAuthConfiguration(): Promise<{
  isValid: boolean;
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  try {
    const debugInfo = await getAuthDebugInfo();
    
    // Check for common issues
    if (debugInfo.authentication.killSwitchActive) {
      warnings.push('JWT authentication is disabled via kill switch');
    }
    
    if (debugInfo.platform.platform === 'ios' && debugInfo.authentication.effectiveMode === 'cookie') {
      if (debugInfo.authentication.killSwitchActive) {
        warnings.push('iOS using cookie auth due to kill switch - expected for emergency fallback');
      } else {
        errors.push('iOS detected but using cookie auth without kill switch active');
      }
    }
    
    if (debugInfo.authentication.effectiveMode === 'token' && !debugInfo.tokens.available) {
      errors.push('Token auth mode selected but secure storage not available');
    }
    
    if (debugInfo.platform.platform === 'web' && debugInfo.authentication.effectiveMode === 'token') {
      errors.push('Web platform should not use token auth');
    }
    
    if (debugInfo.platform.platform === 'android' && debugInfo.authentication.effectiveMode === 'token') {
      errors.push('Android platform should not use token auth');
    }

    const isValid = errors.length === 0;
    
    console.log(`[AUTH VALIDATION] ${isValid ? '✅' : '❌'} Configuration validation complete`);
    if (warnings.length > 0) {
      console.warn('[AUTH VALIDATION] ⚠️ Warnings:', warnings);
    }
    if (errors.length > 0) {
      console.error('[AUTH VALIDATION] ❌ Errors:', errors);
    }
    
    return { isValid, warnings, errors };
  } catch (error) {
    console.error('[AUTH VALIDATION] Validation failed:', error);
    return {
      isValid: false,
      warnings,
      errors: [...errors, `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Emergency authentication reset - clears all auth state
 */
export async function emergencyAuthReset(): Promise<void> {
  console.warn('[AUTH DEBUG] 🚨 Emergency authentication reset initiated');
  
  try {
    // Clear tokens if available
    if (getEffectiveAuthMode() === 'token') {
      const { clearStoredTokens } = await import('./secure-token-storage');
      await clearStoredTokens();
      console.log('[AUTH DEBUG] 🧹 Stored tokens cleared');
    }
    
    // Clear any local storage auth data
    if (typeof window !== 'undefined' && window.localStorage) {
      const authKeys = Object.keys(localStorage).filter(key => 
        key.includes('auth') || key.includes('token') || key.includes('session')
      );
      authKeys.forEach(key => {
        localStorage.removeItem(key);
        console.log(`[AUTH DEBUG] 🧹 Cleared localStorage key: ${key}`);
      });
    }
    
    // Clear session storage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const authKeys = Object.keys(sessionStorage).filter(key => 
        key.includes('auth') || key.includes('token') || key.includes('session')
      );
      authKeys.forEach(key => {
        sessionStorage.removeItem(key);
        console.log(`[AUTH DEBUG] 🧹 Cleared sessionStorage key: ${key}`);
      });
    }
    
    console.log('[AUTH DEBUG] ✅ Emergency reset completed');
  } catch (error) {
    console.error('[AUTH DEBUG] ❌ Emergency reset failed:', error);
  }
}

/**
 * Auth mode monitoring - logs auth events as they happen
 */
export class AuthModeMonitor {
  private static instance: AuthModeMonitor;
  private isMonitoring = false;
  
  static getInstance(): AuthModeMonitor {
    if (!AuthModeMonitor.instance) {
      AuthModeMonitor.instance = new AuthModeMonitor();
    }
    return AuthModeMonitor.instance;
  }
  
  startMonitoring(): void {
    if (this.isMonitoring) {
      console.log('[AUTH MONITOR] Already monitoring');
      return;
    }
    
    this.isMonitoring = true;
    console.log('[AUTH MONITOR] 📡 Started monitoring authentication events');
    
    // Log initial state
    this.logCurrentState();
    
    // Monitor for changes periodically
    setInterval(() => {
      this.logCurrentState();
    }, 30000); // Every 30 seconds
  }
  
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('[AUTH MONITOR] 📡 Stopped monitoring');
  }
  
  private async logCurrentState(): Promise<void> {
    if (!this.isMonitoring) return;
    
    try {
      const effectiveMode = getEffectiveAuthMode();
      const platform = getPlatformDescription();
      
      console.log(`[AUTH MONITOR] 📡 ${new Date().toISOString()} - Platform: ${platform}, Mode: ${effectiveMode}`);
      
      if (effectiveMode === 'token') {
        const tokenDebug = await getTokenDebugInfo();
        if (tokenDebug.isExpired) {
          console.warn('[AUTH MONITOR] ⚠️ Access token is expired');
        }
      }
    } catch (error) {
      console.error('[AUTH MONITOR] Error during monitoring:', error);
    }
  }
}

/**
 * Initialize authentication debugging on app startup
 */
export async function initializeAuthDebugging(): Promise<void> {
  console.log('[AUTH DEBUG] 🚀 Initializing authentication debugging system');
  
  // Log initial diagnostics
  await logAuthDiagnostics();
  
  // Validate configuration
  await validateAuthConfiguration();
  
  // Start monitoring in development
  if (import.meta.env.DEV) {
    AuthModeMonitor.getInstance().startMonitoring();
  }
  
  console.log('[AUTH DEBUG] ✅ Authentication debugging system initialized');
}

// Global debugging functions for console access
if (typeof window !== 'undefined') {
  (window as any).authDebug = {
    getInfo: getAuthDebugInfo,
    logDiagnostics: logAuthDiagnostics,
    validate: validateAuthConfiguration,
    emergencyReset: emergencyAuthReset,
    isJWTDisabled: isJWTAuthDisabled,
    getEffectiveMode: getEffectiveAuthMode
  };
  
  console.log('[AUTH DEBUG] 🛠️ Debug functions available at window.authDebug');
}