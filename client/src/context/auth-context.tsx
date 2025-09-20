import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearDevAuth } from "@/lib/api";
import { 
  detectPlatform, 
  shouldUseTokenAuth, 
  getAuthModeHeader,
  getPlatformDescription 
} from "@/lib/platform-detection";
import { 
  getStoredTokens, 
  storeTokens, 
  clearStoredTokens, 
  getCurrentAccessToken,
  getRefreshToken,
  updateBothTokens,
  isAccessTokenExpired 
} from "@/lib/secure-token-storage";
import { initializeAuthDebugging } from "@/lib/auth-debug";

interface User {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  initials?: string;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  avatar_variant?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  selectedOrgId: string | null;
  organizations: any[];
  setSelectedOrgId: (orgId: string) => void;
  isProUser: boolean;
  setIsProUser: (isPro: boolean) => void;
  reload: () => Promise<void>;
  logout: () => void;
  // Hybrid auth specific properties
  authMode: 'token' | 'cookie';
  platform: string;
  login: (email: string, password: string, orgId?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize React state hooks first - these must be called in the same order every render
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [organizations] = useState<any[]>([]);
  const [isProUser, setIsProUser] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  // Platform and auth mode detection
  const [platformInfo] = useState(() => {
    // Only detect platform once on mount to avoid re-renders
    if (typeof window !== 'undefined') {
      return detectPlatform();
    }
    return { platform: 'web', authMode: 'cookie' as const, shouldUseTokenAuth: false };
  });

  console.log(`[HYBRID AUTH] AuthProvider initialized for ${getPlatformDescription()}`);
  
  // Ensure component is properly mounted before using React Query hooks
  useEffect(() => {
    setMounted(true);
    
    // Initialize authentication debugging system
    initializeAuthDebugging().catch(error => {
      console.error('[HYBRID AUTH] Failed to initialize debugging:', error);
    });
  }, []);

  // Always call hooks unconditionally to avoid hooks rule violations
  const queryClient = useQueryClient();
  
  const { data: authData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: mounted, // Only enable query after mount
  });

  const user = authData ? {
    id: (authData as any).id,
    name: (authData as any).name,
    email: (authData as any).email,
    role: (authData as any).role,
    initials: (authData as any).name ? (authData as any).name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U',
    avatar_url: (authData as any).avatar_url,
    avatar_seed: (authData as any).avatar_seed,
    avatar_variant: (authData as any).avatar_variant
  } : null;

  const isAuthenticated = !!authData && !error;

  const reload = async () => {
    if (mounted && refetch) {
      await refetch();
      // Also invalidate all other queries to refresh the app state
      queryClient.invalidateQueries();
    }
  };

  // Hybrid login function
  const login = async (email: string, password: string, orgId?: string): Promise<boolean> => {
    try {
      console.log(`[HYBRID AUTH] Login attempt for ${platformInfo.authMode} mode on ${platformInfo.platform}`);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Mode': getAuthModeHeader(), // Tell server which auth mode we prefer
        },
        body: JSON.stringify({ email, password, orgId }),
        credentials: 'include', // Always include for session fallback
      });

      if (!response.ok) {
        console.log(`[HYBRID AUTH] Login failed with status: ${response.status}`);
        return false;
      }

      const result = await response.json();
      console.log(`[HYBRID AUTH] Login successful, auth method: ${result.authMethod}, platform: ${result.platform}`);

      // Handle JWT token response (iOS)
      if (result.authMethod === 'jwt' && result.accessToken && result.refreshToken) {
        console.log(`[HYBRID AUTH] Storing JWT tokens for iOS user: ${result.user.id}`);
        
        await storeTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          userId: result.user.id,
          orgId: result.orgId
        });
        
        console.log(`[HYBRID AUTH] JWT tokens stored successfully`);
      } else {
        console.log(`[HYBRID AUTH] Using session authentication (${result.authMethod})`);
      }

      // Refresh auth state
      await reload();
      return true;
    } catch (error) {
      console.error('[HYBRID AUTH] Login error:', error);
      return false;
    }
  };

  // Hybrid logout function
  const logout = async () => {
    try {
      console.log(`[HYBRID AUTH] Logout for ${platformInfo.authMode} mode on ${platformInfo.platform}`);
      
      // Clear stored tokens for iOS
      if (shouldUseTokenAuth()) {
        console.log('[HYBRID AUTH] Clearing stored JWT tokens');
        await clearStoredTokens();
      }

      // Clear dev headers
      clearDevAuth();
      
      // Call logout endpoint (this clears server session)
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch (logoutError) {
        console.error('[HYBRID AUTH] Logout endpoint error:', logoutError);
        // Continue with logout even if endpoint fails
      }

      // Clear query cache and redirect
      queryClient.clear();
      window.location.href = '/login';
    } catch (error) {
      console.error('[HYBRID AUTH] Logout error:', error);
      // Force redirect on error
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      selectedOrgId: selectedOrgId || (authData as any)?.orgId,
      organizations,
      setSelectedOrgId,
      isProUser,
      setIsProUser,
      reload,
      logout,
      // Hybrid auth properties
      authMode: platformInfo.authMode,
      platform: platformInfo.platform,
      login
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
