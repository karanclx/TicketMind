import type { Request, Response, NextFunction } from "express"
import { AuthenticationError } from "../lib/errors.js"
import { ApiKeyModel } from "../models/ApiKey.js"
import { verifyApiKey } from "../lib/auth.js"

export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKeyHeader = req.header("X-API-Key")

  if (!apiKeyHeader) {
    throw new AuthenticationError("API key required")
  }

  const prefix = apiKeyHeader.substring(0, 11)
  const apiKey = await ApiKeyModel.findOne({ keyPrefix: prefix, revokedAt: null })
  
  if (!apiKey) {
    throw new AuthenticationError("Invalid API key")
  }

  const isValid = await verifyApiKey(apiKeyHeader, apiKey.keyHash)
  if (!isValid) {
    throw new AuthenticationError("Invalid API key")
  }

  apiKey.lastUsedAt = new Date()
  await apiKey.save()

  req.auth = {
    organizationId: apiKey.organizationId.toString(),
    apiKeyId: apiKey._id.toString()
  }
  
  next()
}
