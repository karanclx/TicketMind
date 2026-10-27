import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"
import { handoffDecision, teamForCategory } from "../modules/support/support-policy.js"
import { handoffSchema } from "../modules/support/support.schemas.js"

const { findTicket, updateTicket, findUser } = vi.hoisted(() => ({ findTicket: vi.fn(), updateTicket: vi.fn(), findUser: vi.fn() }))
vi.mock("../models/SupportTicket.js", () => ({ SupportTicketModel: { findOne: findTicket, findOneAndUpdate: updateTicket } }))
vi.mock("../models/User.js", () => ({ UserModel: { findOne: findUser } }))
import { SupportService } from "../modules/support/support.service.js"
const service = new SupportService()
const requesterId = new Types.ObjectId().toString()
const agentId = new Types.ObjectId().toString()
const orgId = new Types.ObjectId().toString()
const ticketId = new Types.ObjectId().toString()
const agent = { userId: agentId, organizationId: orgId, role: "agent" }
const requester = { userId: requesterId, organizationId: orgId, role: "member" }
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) })
const ticket = (extra = {}) => ({ _id: ticketId, createdBy: new Types.ObjectId(requesterId), workflowStatus: "needs_human", handoffRevision: 1, ...extra })
beforeEach(() => { vi.resetAllMocks(); findTicket.mockReturnValue(lean(ticket())); updateTicket.mockReturnValue(lean(ticket())); findUser.mockReturnValue(lean(null)) })

describe("handoff policy", () => {
  it.each(["mock", "deterministic-fallback"])("always sends %s results to humans", provider => {
    expect(handoffDecision({ category: "Login", priority: "Low", auto_resolve: true, confidence: .95 }, provider).workflowStatus).toBe("needs_human")
  })
  it.each(["Critical", "High"])("escalates %s even when AI suggests auto resolution", priority => {
    expect(handoffDecision({ category: "Network", priority, auto_resolve: true, confidence: .95 }, "groq").workflowStatus).toBe("needs_human")
  })
  it("waits for confirmation instead of treating an AI suggestion as a fix", () => {
    expect(handoffDecision({ category: "Login", priority: "Low", auto_resolve: true, confidence: .95 }, "groq").workflowStatus).toBe("awaiting_confirmation")
  })
  it("routes categories to the correct team and defaults to helpdesk", () => {
    expect(teamForCategory("Network")).toBe("Network Support")
    expect(teamForCategory("Access")).toBe("Account Support")
    expect(teamForCategory("unknown")).toBe("IT Helpdesk")
  })
})

describe("human workflow permissions and transitions", () => {
  it("scopes ticket lookups to the actor's organization", async () => {
    findTicket.mockReturnValue(lean(null))
    await expect(service.update(ticketId, agent, { action: "start", expected_revision: 1 })).rejects.toMatchObject({ statusCode: 404 })
    expect(findTicket).toHaveBeenCalledWith({ _id: ticketId, organizationId: orgId })
    expect(updateTicket).not.toHaveBeenCalled()
  })
  it("rejects cross-workspace or non-support assignees", async () => {
    await expect(service.update(ticketId, agent, { action: "assign", expected_revision: 1, team: "Network Support", assignee_id: requesterId })).rejects.toThrow("Assignee must be support staff")
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgId, role: { $in: ["owner", "admin", "agent"] } }))
    expect(updateTicket).not.toHaveBeenCalled()
  })
  it("rejects assignment by the requester", async () => {
    await expect(service.update(ticketId, requester, { action: "assign", expected_revision: 1, team: "Network Support" })).rejects.toMatchObject({ statusCode: 403 })
  })
  it("rejects another member changing someone else's ticket", async () => {
    await expect(service.update(ticketId, { ...requester, userId: agentId }, { action: "request_human", expected_revision: 1 })).rejects.toMatchObject({ statusCode: 403 })
  })
  it("allows a requester to reject an AI suggestion", async () => {
    findTicket.mockReturnValue(lean(ticket({ workflowStatus: "awaiting_confirmation" })))
    await service.update(ticketId, requester, { action: "request_human", expected_revision: 1 })
    expect(updateTicket).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgId, handoffRevision: 1 }), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "needs_human" }) }), expect.anything())
  })
  it("allows confirmation only from the awaiting-confirmation state", async () => {
    await expect(service.update(ticketId, requester, { action: "confirm_fixed", expected_revision: 1 })).rejects.toThrow("not awaiting confirmation")
  })
  it("records requester confirmation", async () => {
    findTicket.mockReturnValue(lean(ticket({ workflowStatus: "awaiting_confirmation" })))
    await service.update(ticketId, requester, { action: "confirm_fixed", expected_revision: 1 })
    expect(updateTicket).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "resolved", resolvedBy: requesterId }) }), expect.anything())
  })
  it("claims an unassigned human ticket", async () => {
    await service.update(ticketId, agent, { action: "start", expected_revision: 1 })
    expect(updateTicket).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "in_progress", assignedTo: new Types.ObjectId(agentId) }) }), expect.anything())
  })
  it("does not steal someone else's assignment on claim", async () => {
    findTicket.mockReturnValue(lean(ticket({ assignedTo: new Types.ObjectId(requesterId) })))
    await expect(service.update(ticketId, agent, { action: "start", expected_revision: 1 })).rejects.toThrow("assigned to someone else")
  })
  it("requires a resolution note", async () => {
    await expect(service.update(ticketId, agent, { action: "resolve", expected_revision: 1, note: "" })).rejects.toThrow("resolution note")
    expect(updateTicket).not.toHaveBeenCalled()
  })
  it("records human resolution", async () => {
    await service.update(ticketId, agent, { action: "resolve", expected_revision: 1, note: "Replaced failed uplink." })
    expect(updateTicket).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "resolved", resolutionNote: "Replaced failed uplink." }) }), expect.anything())
  })
  it("reopens a resolved ticket for human support", async () => {
    findTicket.mockReturnValue(lean(ticket({ workflowStatus: "resolved" })))
    await service.update(ticketId, requester, { action: "reopen", expected_revision: 1 })
    expect(updateTicket).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "needs_human", resolvedAt: null }) }), expect.anything())
  })
  it("rejects stale or racing updates", async () => {
    await expect(service.update(ticketId, agent, { action: "start", expected_revision: 0 })).rejects.toMatchObject({ statusCode: 409 })
    updateTicket.mockReturnValue(lean(null))
    await expect(service.update(ticketId, agent, { action: "start", expected_revision: 1 })).rejects.toMatchObject({ statusCode: 409 })
  })
  it("rejects extra mutation fields and invalid teams", () => {
    expect(handoffSchema.safeParse({ action: "assign", expected_revision: 1, team: "Fake team", organizationId: orgId }).success).toBe(false)
  })
})
