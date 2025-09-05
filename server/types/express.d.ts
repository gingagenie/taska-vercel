declare namespace Express {
  interface Request {
    user?: { id: string }
    orgId?: string
    subscription?: {
      planId: string
      status: string
      isActive: boolean
      features: any[]
    }
  }
  
  interface Session {
    userId?: string
    orgId?: string
  }
}