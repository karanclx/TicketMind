import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { env } from "../config/env.js"

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export interface SessionPayload {
  userId: string
  organizationId: string
  role: string
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, { expiresIn: "7d" })
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET) as SessionPayload
    return decoded
  } catch (error) {
    return null
  }
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(32).toString("hex")
  const raw = `tm_${randomBytes}`
  const prefix = raw.substring(0, 11) // "tm_" + 8 chars
  
  // Use crypto hashing instead of bcrypt for API keys to avoid bcrypt timing limits
  // but prompt says "hashed with the same approach as passwords before storage"
  // Let's use bcrypt for compliance with prompt, although crypto.scrypt is better for API keys usually.
  const hash = bcrypt.hashSync(raw, 10)
  
  return { raw, hash, prefix }
}

export async function verifyApiKey(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash)
}
