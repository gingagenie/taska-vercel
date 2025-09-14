import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SupportUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
  initials?: string;
  avatar_url?: string | null;
}

interface SupportAuthContextType {
  user: SupportUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  reload: () => Promise<void>;
  logout: () => void;
}

const SupportAuthContext = createContext<SupportAuthContextType | undefined>(undefined);

export function SupportAuthProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  
  // Ensure component is properly mounted before using React Query hooks
  useEffect(() => {
    setMounted(true);
  }, []);

  // Always call hooks unconditionally to avoid hooks rule violations
  const queryClient = useQueryClient();
  
  const { data: authData, isLoading, error, refetch } = useQuery({
    queryKey: ["/support/api/auth/me"],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: mounted, // Only enable query after mount
    queryFn: async () => {
      const response = await fetch("/support/api/auth/me", {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error("Failed to fetch support user");
      }
      return response.json();
    }
  });

  const user = authData ? {
    id: (authData as any).id,
    name: (authData as any).name,
    email: (authData as any).email,
    role: (authData as any).role,
    is_active: (authData as any).is_active,
    initials: (authData as any).name ? (authData as any).name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'S',
  } : null;

  const isAuthenticated = !!authData && !error;

  const reload = async () => {
    if (mounted && refetch) {
      await refetch();
      // Also invalidate all other queries to refresh the app state
      queryClient.invalidateQueries();
    }
  };

  const logout = async () => {
    try {
      await fetch("/support/api/auth/logout", {
        method: "POST",
        credentials: 'include'
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    // Redirect to support admin login page
    window.location.href = "/support-admin/login";
  };

  return (
    <SupportAuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      reload,
      logout
    }}>
      {children}
    </SupportAuthContext.Provider>
  );
}

export function useSupportAuth() {
  const context = useContext(SupportAuthContext);
  if (context === undefined) {
    throw new Error("useSupportAuth must be used within a SupportAuthProvider");
  }
  return context;
}