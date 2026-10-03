import type { Request, Response, NextFunction } from "express"
import { AuthenticationError } from "../lib/errors.js"

export const requireRole = (roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new AuthenticationError("Authentication required")
    }

    if (!req.auth?.role || !roles.includes(req.auth.role)) {
      throw new AuthenticationError("Forbidden: Insufficient role")
    }

    next()
  }
}
