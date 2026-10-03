import type { Request, Response, NextFunction } from "express"
import { verifySessionToken } from "../lib/auth.js"
import { AuthenticationError } from "../lib/errors.js"

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.["session"]

  if (!token) {
    throw new AuthenticationError("Authentication required")
  }

  const payload = verifySessionToken(token)
  if (!payload) {
    throw new AuthenticationError("Invalid or expired session")
  }

  req.auth = payload
  next()
}
