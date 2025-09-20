import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { handleSubscriptionError } from "./subscription-error-handler";
import { shouldUseTokenAuth, getAuthModeHeader } from "./platform-detection";
import { getCurrentAccessToken, getRefreshToken, updateBothTokens, isAccessTokenExpired } from "./secure-token-storage";

/**
 * Get authorization headers for API requests
 * Returns Authorization header for iOS token mode, empty object for cookie mode
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!shouldUseTokenAuth()) {
    // Web/Android: Use cookies, no additional headers needed
    return {};
  }

  // iOS: Use JWT tokens
  try {
    const accessToken = await getCurrentAccessToken();
    if (accessToken) {
      console.log('[HYBRID API] Using JWT token for request');
      return {
        'Authorization': `Bearer ${accessToken}`,
        'X-Auth-Mode': getAuthModeHeader()
      };
    } else {
      console.log('[HYBRID API] No valid access token available');
      return {
        'X-Auth-Mode': getAuthModeHeader()
      };
    }
  } catch (error) {
    console.error('[HYBRID API] Error getting auth headers:', error);
    return {
      'X-Auth-Mode': getAuthModeHeader()
    };
  }
}

/**
 * Attempt to refresh JWT tokens if they're expired
 * Returns true if refresh was successful or not needed
 */
async function refreshTokenIfNeeded(): Promise<boolean> {
  if (!shouldUseTokenAuth()) {
    return true; // No refresh needed for cookie mode
  }

  try {
    const isExpired = await isAccessTokenExpired();
    if (!isExpired) {
      return true; // Token is still valid
    }

    console.log('[HYBRID API] Access token expired, attempting refresh');
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      console.log('[HYBRID API] No refresh token available');
      return false;
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': getAuthModeHeader()
      },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include'
    });

    if (!response.ok) {
      console.log(`[HYBRID API] Token refresh failed: ${response.status}`);
      return false;
    }

    const result = await response.json();
    if (result.accessToken && result.refreshToken) {
      await updateBothTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
      console.log('[HYBRID API] Tokens refreshed successfully');
      return true;
    }

    console.log('[HYBRID API] Invalid refresh response');
    return false;
  } catch (error) {
    console.error('[HYBRID API] Token refresh error:', error);
    return false;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const error = new Error(`${res.status}: ${text}`);
    
    // Handle subscription-related errors globally
    if (res.status === 402) {
      try {
        const errorData = JSON.parse(text);
        if (errorData.code === 'TRIAL_EXPIRED' || errorData.code === 'SUBSCRIPTION_REQUIRED') {
          handleSubscriptionError(error);
          return; // Don't throw, as we're redirecting
        }
      } catch {
        // If JSON parsing fails, continue with regular error handling
      }
    }
    
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Attempt token refresh for iOS if needed
  await refreshTokenIfNeeded();
  
  // Get auth headers (Authorization for iOS, empty for web/Android)
  const authHeaders = await getAuthHeaders();
  
  const headers = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...authHeaders
  };

  console.log(`[HYBRID API] ${method} ${url} with auth mode: ${shouldUseTokenAuth() ? 'token' : 'cookie'}`);
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Always include for session fallback
  });

  // If we get 401 and using tokens, try one more time after refresh
  if (res.status === 401 && shouldUseTokenAuth()) {
    console.log('[HYBRID API] Got 401, attempting token refresh and retry');
    const refreshed = await refreshTokenIfNeeded();
    if (refreshed) {
      const newAuthHeaders = await getAuthHeaders();
      const newHeaders = {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...newAuthHeaders
      };
      
      const retryRes = await fetch(url, {
        method,
        headers: newHeaders,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
      
      await throwIfResNotOk(retryRes);
      return retryRes;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Attempt token refresh for iOS if needed
    await refreshTokenIfNeeded();
    
    // Get auth headers (Authorization for iOS, empty for web/Android)
    const authHeaders = await getAuthHeaders();
    
    const url = queryKey.join("/") as string;
    console.log(`[HYBRID API] Query ${url} with auth mode: ${shouldUseTokenAuth() ? 'token' : 'cookie'}`);
    
    const res = await fetch(url, {
      credentials: "include", // Always include for session fallback
      headers: authHeaders
    });

    // Handle 401 with token retry
    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      
      // If using tokens, try one more time after refresh
      if (shouldUseTokenAuth()) {
        console.log('[HYBRID API] Query got 401, attempting token refresh and retry');
        const refreshed = await refreshTokenIfNeeded();
        if (refreshed) {
          const newAuthHeaders = await getAuthHeaders();
          const retryRes = await fetch(url, {
            credentials: "include",
            headers: newAuthHeaders
          });
          
          if (retryRes.status === 401 && unauthorizedBehavior === "returnNull") {
            return null;
          }
          
          await throwIfResNotOk(retryRes);
          return await retryRes.json();
        }
      }
    }

    // Handle subscription errors in queries too
    if (res.status === 402) {
      const text = (await res.text()) || res.statusText;
      const error = new Error(`${res.status}: ${text}`);
      try {
        const errorData = JSON.parse(text);
        if (errorData.code === 'TRIAL_EXPIRED' || errorData.code === 'SUBSCRIPTION_REQUIRED') {
          console.log('[DEBUG] Query function handling subscription error');
          handleSubscriptionError(error);
          throw error; // Still throw so React Query knows it failed
        }
      } catch (parseError) {
        // If JSON parsing fails, continue with regular error handling
        console.log('[DEBUG] Failed to parse subscription error:', parseError);
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
