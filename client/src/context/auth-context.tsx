import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [organizations] = useState<any[]>([]);
  const [isProUser, setIsProUser] = useState(false);

  // Check authentication status from session
  const { data: authData, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = authData ? {
    id: authData.id,
    name: authData.name,
    email: authData.email,
    role: authData.role,
    initials: authData.name ? authData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U',
    avatar_url: authData.avatar_url,
    avatar_seed: authData.avatar_seed,
    avatar_variant: authData.avatar_variant
  } : null;

  const isAuthenticated = !!authData && !error;

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      selectedOrgId: selectedOrgId || authData?.orgId,
      organizations,
      setSelectedOrgId,
      isProUser,
      setIsProUser
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
