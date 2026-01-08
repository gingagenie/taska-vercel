declare namespace Express {
  interface Request {
    user?: { id: string; role?: string }
    orgId?: string
    isSupportStaff?: boolean
    supportStaffOrgId?: string
    subscription?: {
      planId: string
      status: string
      isActive: boolean
      trialEnd?: Date
      features: any[]
    }
  }
  
  interface Session {
    userId?: string
    orgId?: string
    user?: { 
      id: string; 
      role?: string;
      email?: string;
    }
    role?: string
    supportUserId?: string
  }
}

declare global {
  namespace Express {
    interface Request {
      isPortal?: boolean;
      customerId?: string;
      orgId?: string;
      subscription?: any;
      user?: { id: string };
    }
  }
}
export {};
