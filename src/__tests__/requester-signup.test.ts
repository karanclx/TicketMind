import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"
const { findOrg, findUser, createUser } = vi.hoisted(() => ({ findOrg: vi.fn(), findUser: vi.fn(), createUser: vi.fn() }))
vi.mock("../models/Organization.js", () => ({ OrganizationModel: { findOne: findOrg } }))
vi.mock("../models/User.js", () => ({ UserModel: { findOne: findUser, create: createUser } }))
import { AuthService } from "../modules/auth/auth.service.js"
import { requesterSignupSchema } from "../modules/auth/auth.schemas.js"
const input = { invite: "a".repeat(48), email: "student@example.edu", password: "requester-password" }
beforeEach(() => vi.resetAllMocks())
describe("requester signup", () => {
  it("rejects attempts to submit a privileged role or select an arbitrary workspace", () => {
    expect(requesterSignupSchema.safeParse({ ...input, role: "owner" }).success).toBe(false)
    expect(requesterSignupSchema.safeParse({ ...input, organizationId: new Types.ObjectId().toString() }).success).toBe(false)
  })
  it("requires a valid invitation", async () => {
    findOrg.mockResolvedValue(null)
    await expect(new AuthService().joinAsRequester(input)).rejects.toThrow("invalid or has been replaced")
    expect(createUser).not.toHaveBeenCalled()
  })
  it("creates only a member within the invited organization", async () => {
    const orgId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    findOrg.mockResolvedValue({ _id: orgId })
    findUser.mockResolvedValue(null)
    createUser.mockResolvedValue({ _id: userId })
    const result = await new AuthService().joinAsRequester(input)
    expect(result).toEqual({ userId: userId.toString(), organizationId: orgId.toString(), role: "member" })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgId, role: "member" }))
    expect(createUser.mock.calls[0]?.[0].passwordHash).not.toBe(input.password)
    expect(findOrg.mock.calls[0]?.[0].requesterInviteHash).not.toBe(input.invite)
  })
})
