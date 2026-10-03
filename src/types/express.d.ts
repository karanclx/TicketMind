declare namespace Express {
  export interface Request {
    auth?: {
      userId?: string
      organizationId: string
      role?: string
      apiKeyId?: string
    }
  }
}
