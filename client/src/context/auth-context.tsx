import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearDevAuth } from "@/lib/api";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize React state hooks first - these must be called in the same order every render
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [organizations] = useState<any[]>([]);
  const [isProUser, setIsProUser] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  // Ensure component is properly mounted before using React Query hooks
  useEffect(() => {
    setMounted(true);
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

  const logout = () => {
    clearDevAuth(); // Clear any dev headers
    window.location.href = '/api/auth/logout';
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
      logout
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
