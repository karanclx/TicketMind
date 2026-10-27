import { OrganizationModel } from "../../models/Organization.js"
import { UserModel } from "../../models/User.js"
import { hashPassword, verifyPassword, type SessionPayload } from "../../lib/auth.js"
import { AuthenticationError, ValidationError } from "../../lib/errors.js"
import type { SignupInput, LoginInput, RequesterSignupInput } from "./auth.schemas.js"
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

  async joinAsRequester(input: RequesterSignupInput): Promise<SessionPayload> {
    const requesterInviteHash = crypto.createHash("sha256").update(input.invite).digest("hex")
    const organization = await OrganizationModel.findOne({ requesterInviteHash })
    if (!organization) throw new ValidationError("This requester signup link is invalid or has been replaced. Ask your helpdesk for a new link.")
    if (await UserModel.findOne({ email: input.email })) throw new ValidationError("Email already in use. Sign in with your existing account.")
    try {
      const user = await UserModel.create({
        organizationId: organization._id, email: input.email,
        passwordHash: await hashPassword(input.password), role: "member"
      })
      return { userId: user._id.toString(), organizationId: organization._id.toString(), role: "member" }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new ValidationError("Email already in use")
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
