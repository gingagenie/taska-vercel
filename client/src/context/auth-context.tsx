import { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  avatar_variant?: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  selectedOrgId: string | null;
  organizations: Organization[];
  setSelectedOrgId: (orgId: string) => void;
  setUser: (user: User | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  isProUser: boolean;
  setIsProUser: (isPro: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>({
    id: "user-1",
    name: "John Doe",
    email: "john@example.com",
    role: "Administrator",
    initials: "JD",
    avatar_url: null,
    avatar_seed: "taska-1",
    avatar_variant: "beam"
  });
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>("4500ba4e-e575-4f82-b196-27dd4c7d0eaf");
  const [organizations, setOrganizations] = useState<Organization[]>([
    { id: "4500ba4e-e575-4f82-b196-27dd4c7d0eaf", name: "Taska Demo Org" },
    { id: "05e9e656-475e-4094-a1a2-33b09815cf82", name: "Tech Solutions Co" }
  ]);
  const [isProUser, setIsProUser] = useState(false);

  // Set default headers for API requests
  useEffect(() => {
    if (user?.id) {
      // These would normally be JWT tokens or session cookies
      // For now we use the header-based auth system from the backend
    }
  }, [user, selectedOrgId]);

  return (
    <AuthContext.Provider value={{
      user,
      selectedOrgId,
      organizations,
      setSelectedOrgId,
      setUser,
      setOrganizations,
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
