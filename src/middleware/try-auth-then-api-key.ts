import type { Request, Response, NextFunction } from "express"
import { verifySessionToken, verifyApiKey } from "../lib/auth.js"
import { AuthenticationError } from "../lib/errors.js"
import { ApiKeyModel } from "../models/ApiKey.js"

export const tryAuthThenApiKey = async (req: Request, res: Response, next: NextFunction) => {
  // 1. Try session first
  const token = req.cookies?.["session"]
  if (token) {
    const payload = verifySessionToken(token)
    if (payload) {
      req.auth = payload
      return next()
    }
  }

  // 2. Try API key
  const apiKeyHeader = req.header("X-API-Key")
  if (apiKeyHeader) {
    const prefix = apiKeyHeader.substring(0, 11)
    const apiKey = await ApiKeyModel.findOne({ keyPrefix: prefix, revokedAt: null })
    
    if (apiKey) {
      const isValid = await verifyApiKey(apiKeyHeader, apiKey.keyHash)
      if (isValid) {
        apiKey.lastUsedAt = new Date()
        await apiKey.save()
        
        req.auth = {
          organizationId: apiKey.organizationId.toString(),
          apiKeyId: apiKey._id.toString()
        }
        return next()
      }
    }
  }

  // 3. Fallback
  throw new AuthenticationError("Authentication required (valid session or API key)")
}
