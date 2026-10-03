import mongoose from "mongoose"
import { OrganizationModel } from "../../models/Organization.js"
import { UserModel } from "../../models/User.js"
import { hashPassword, verifyPassword, signSessionToken, type SessionPayload } from "../../lib/auth.js"
import { AuthenticationError, ValidationError } from "../../lib/errors.js"
import type { SignupInput, LoginInput } from "./auth.schemas.js"
import crypto from "crypto"

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export class AuthService {
  async signup(input: SignupInput): Promise<SessionPayload> {
    const existingUser = await UserModel.findOne({ email: input.email })
    if (existingUser) {
      throw new ValidationError("Email already in use")
    }

    let slug = generateSlug(input.organizationName)
    const existingOrg = await OrganizationModel.findOne({ slug })
    if (existingOrg) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`
    }

    const organization = await OrganizationModel.create({
      name: input.organizationName,
      slug
    })

    try {
      const passwordHash = await hashPassword(input.password)

      const user = await UserModel.create({
        organizationId: organization._id,
        email: input.email,
        passwordHash,
        role: "owner"
      })

      return {
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        role: user.role
      }
    } catch (error) {
      // Manual cleanup on failure
      await OrganizationModel.deleteOne({ _id: organization._id })
      throw error
    }
  }

  async login(input: LoginInput): Promise<SessionPayload> {
    const user = await UserModel.findOne({ email: input.email }).select("+passwordHash")
    
    if (!user) {
      throw new AuthenticationError("Invalid email or password")
    }

    const isValid = await verifyPassword(input.password, user.passwordHash)
    if (!isValid) {
      throw new AuthenticationError("Invalid email or password")
    }

    user.lastLoginAt = new Date()
    await user.save()

    return {
      userId: user._id.toString(),
      organizationId: user.organizationId.toString(),
      role: user.role
    }
  }

  async getMe(userId: string) {
    const user = await UserModel.findById(userId).populate("organizationId")
    if (!user) {
      throw new AuthenticationError("User not found")
    }
    return user
  }
}

export const authService = new AuthService()
