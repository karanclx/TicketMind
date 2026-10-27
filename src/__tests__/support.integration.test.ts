import { afterAll, beforeAll, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import request from "supertest"
import { env } from "../config/env.js"
import { createApp } from "../app.js"
import { SupportTicketModel } from "../models/SupportTicket.js"
import { UserModel } from "../models/User.js"
import { hashPassword } from "../lib/auth.js"

// Explicitly opt in. Uses a new temporary database, never the application's database.
describe.skipIf(process.env["RUN_MONGO_INTEGRATION"] !== "1")("MongoDB human support integration", () => {
  const database = `tm_handoff_${process.pid}_${Date.now().toString(36)}`
  const app = createApp()
  const owner = request.agent(app)
  const agent = request.agent(app)
  const outsider = request.agent(app)
  const member = request.agent(app)
  beforeAll(async () => {
    if (env.LLM_PROVIDER !== "mock") throw new Error("Integration checks require LLM_PROVIDER=mock")
    await mongoose.connect(env.MONGODB_URI, { dbName: database, serverSelectionTimeoutMS: 5000 })
  }, 10000)
  afterAll(async () => {
    try {
      if (mongoose.connection.name === database && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase()
    } finally { await mongoose.disconnect() }
  })
  it("creates, routes, assigns, claims, resolves and reopens an actual ticket with tenant isolation", async () => {
    expect((await owner.post("/auth/workspace").send({ email: "owner@handoff.test", password: "owner-test-password", organizationName: "Test campus" })).status).toBe(201)
    const ownerUser = await UserModel.findOne({ email: "owner@handoff.test" }).orFail()
    const createdAgent = await owner.post("/support/agents").send({ email: "agent@handoff.test", password: "agent-test-password" })
    expect(createdAgent.status).toBe(201)
    expect(createdAgent.body).not.toHaveProperty("passwordHash")
    const storedAgent = await UserModel.findById(createdAgent.body.id).select("+passwordHash").orFail()
    expect(storedAgent.passwordHash).not.toBe("agent-test-password")
    expect((await agent.post("/auth/login").send({ email: "agent@handoff.test", password: "agent-test-password" })).status).toBe(200)
    expect((await agent.post("/support/agents").send({ email: "no@handoff.test", password: "agent-test-password" })).status).toBe(401)
    expect((await outsider.post("/auth/workspace").send({ email: "other@handoff.test", password: "owner-test-password", organizationName: "Other campus" })).status).toBe(201)
    const otherUser = await UserModel.findOne({ email: "other@handoff.test" }).orFail()
    const created = await owner.post("/tickets").send({ title: "Campus network outage", description: "All departments lost internet access", user_role: "student", timestamp: new Date().toISOString() })
    expect(created.status).toBe(202)
    const id = String(created.body.id)
    let detail = await owner.get(`/tickets/${id}`)
    for (let i = 0; i < 30 && detail.body.workflow.status === "awaiting_ai"; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      detail = await owner.get(`/tickets/${id}`)
    }
    expect(detail.body.workflow.status).toBe("needs_human")
    expect(detail.body.created_by).toBe(ownerUser._id.toString())
    expect((await owner.get("/support/tickets?status=needs_human")).body.total).toBe(1)
    expect((await outsider.get("/support/tickets")).body.total).toBe(0)
    expect((await outsider.patch(`/tickets/${id}/handoff`).send({ action: "start", expected_revision: detail.body.workflow.revision })).status).toBe(404)
    expect((await owner.patch(`/tickets/${id}/handoff`).send({ action: "assign", expected_revision: detail.body.workflow.revision, team: "Network Support", assignee_id: otherUser._id.toString() })).status).toBe(400)
    expect((await owner.patch(`/tickets/${id}/handoff`).send({ action: "assign", expected_revision: detail.body.workflow.revision, team: "Network Support", assignee_id: createdAgent.body.id })).status).toBe(200)
    detail = await agent.get(`/tickets/${id}`)
    expect(detail.body.workflow.assignee_id).toBe(createdAgent.body.id)
    expect((await agent.patch(`/tickets/${id}/handoff`).send({ action: "start", expected_revision: detail.body.workflow.revision })).status).toBe(200)
    detail = await agent.get(`/tickets/${id}`)
    expect(detail.body.workflow.status).toBe("in_progress")
    expect((await agent.patch(`/tickets/${id}/handoff`).send({ action: "resolve", expected_revision: detail.body.workflow.revision })).status).toBe(400)
    expect((await agent.patch(`/tickets/${id}/handoff`).send({ action: "resolve", expected_revision: detail.body.workflow.revision, note: "Replaced failed core uplink and verified connectivity." })).status).toBe(200)
    detail = await owner.get(`/tickets/${id}`)
    expect(detail.body.workflow.status).toBe("resolved")
    expect((await owner.get("/support/tickets?status=needs_human")).body.total).toBe(0)
    // Reprocessing must preserve human resolution and the assigned agent.
    const previousVersion = detail.body.ai.version
    expect((await owner.post(`/tickets/${id}/process`)).status).toBe(202)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      detail = await owner.get(`/tickets/${id}`)
      if (detail.body.ai.version > previousVersion) break
    }
    expect(detail.body.ai.version).toBeGreaterThan(previousVersion)
    expect(detail.body.workflow.status).toBe("resolved")
    expect(detail.body.workflow.assignee_id).toBe(createdAgent.body.id)
    expect((await owner.patch(`/tickets/${id}/handoff`).send({ action: "reopen", expected_revision: detail.body.workflow.revision })).status).toBe(200)
    expect((await owner.get("/support/tickets?status=needs_human&team=Network%20Support")).body.total).toBe(1)
    // A member can confirm their own suggestion, but cannot administer the queue.
    const newMember = await UserModel.create({ email: "member@handoff.test", passwordHash: await hashPassword("member-test-password"), organizationId: ownerUser.organizationId, role: "member" })
    await member.post("/auth/login").send({ email: "member@handoff.test", password: "member-test-password" })
    expect((await member.get("/support/tickets")).status).toBe(401)
    await SupportTicketModel.updateOne({ _id: id }, { $set: { createdBy: newMember._id, workflowStatus: "awaiting_confirmation" }, $inc: { handoffRevision: 1 } })
    detail = await member.get(`/tickets/${id}`)
    expect((await member.patch(`/tickets/${id}/handoff`).send({ action: "confirm_fixed", expected_revision: detail.body.workflow.revision })).status).toBe(200)
    expect((await member.get(`/tickets/${id}`)).body.workflow.status).toBe("resolved")
    // Real requester onboarding joins the existing workspace without granting support powers.
    const invited = request.agent(app)
    const inviteResponse = await owner.post("/support/requester-invite")
    expect(inviteResponse.status).toBe(200)
    const invite = String(inviteResponse.body.invite)
    expect((await invited.post("/auth/signup").send({ email: "invited@handoff.test", password: "requester-password", invite, role: "owner" })).status).toBe(400)
    expect((await invited.post("/auth/signup").send({ email: "invited@handoff.test", password: "requester-password", invite })).status).toBe(201)
    const me = await invited.get("/auth/me")
    expect(me.body.user.role).toBe("member")
    expect(me.body.organization._id).toBe(ownerUser.organizationId.toString())
    expect(me.body.organization).not.toHaveProperty("requesterInviteHash")
    expect((await invited.get("/support/tickets")).status).toBe(401)
    expect((await invited.get("/health")).status).toBe(401)
    expect((await invited.get("/billing/portal-session")).status).toBe(401)
    expect((await invited.get(`/tickets/${id}`)).status).toBe(404)
    expect((await invited.post(`/tickets/${id}/process`)).status).toBe(403)
    expect((await invited.get("/tickets/mine")).body.total).toBe(0)
    const raised = await invited.post("/tickets").send({ title: "Printer unavailable", description: "My printer is not responding", user_role: "student", timestamp: new Date().toISOString() })
    expect(raised.status).toBe(202)
    let raisedDetail = await invited.get(`/tickets/${raised.body.id}`)
    for (let i = 0; i < 30 && raisedDetail.body.workflow.status === "awaiting_ai"; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      raisedDetail = await invited.get(`/tickets/${raised.body.id}`)
    }
    expect(raisedDetail.body.workflow.status).toBe("needs_human")
    expect((await invited.get("/tickets/mine")).body.total).toBe(1)
    expect((await member.get(`/tickets/${raised.body.id}`)).status).toBe(404)
    expect((await owner.get(`/tickets/${raised.body.id}`)).status).toBe(200)
    expect((await invited.patch(`/tickets/${raised.body.id}/handoff`).send({ action: "assign", expected_revision: raisedDetail.body.workflow.revision, team: "IT Helpdesk" })).status).toBe(403)
    await owner.post("/support/requester-invite")
    expect((await request(app).post("/auth/signup").send({ email: "expired@handoff.test", password: "requester-password", invite })).status).toBe(400)
  }, 45000)
})
