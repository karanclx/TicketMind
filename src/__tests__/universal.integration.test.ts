import { AiResultModel } from "../models/AiResult.js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import request from "supertest"
import sharp from "sharp"
import { env } from "../config/env.js"
import { createApp } from "../app.js"
import { SupportTicketModel } from "../models/SupportTicket.js"
import { WebhookDeliveryModel } from "../models/WebhookDelivery.js"
import { ticketQueue } from "../modules/tickets/ticket.module.js"
import { WORKSPACE_TEMPLATES } from "../modules/workspace/workspace.settings.js"
const { send } = vi.hoisted(() => ({ send: vi.fn(async () => 204) }))
vi.mock("../modules/integrations/webhook.transport.js", async importOriginal => ({ ...await importOriginal<object>(), sendWebhook: send }))
import { dispatchOutbox, deliverWebhook } from "../modules/integrations/webhook.worker.js"

describe.skipIf(process.env["RUN_MONGO_INTEGRATION"] !== "1")("universal integration with isolated MongoDB", () => {
  const database = `tm_universal_${process.pid}_${Date.now().toString(36)}`
  const app = createApp(), owner = request.agent(app), other = request.agent(app)
  beforeAll(async () => {
    if (env.LLM_PROVIDER !== "mock" || env.SIGHTENGINE_API_USER) throw new Error("Integration tests require mocked AI and no image credentials")
    await mongoose.connect(env.MONGODB_URI, { dbName: database, serverSelectionTimeoutMS: 15000 })
    await Promise.all([SupportTicketModel.init(), WebhookDeliveryModel.init(), AiResultModel.init()])
  }, 20000)
  afterAll(async () => {
    try { if (mongoose.connection.name === database && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  })
  it("configures food delivery, deduplicates concurrent submissions, recovers work and delivers signed events with retry", async () => {
    expect((await owner.post("/auth/workspace").send({ email: "owner@universal.test", password: "universal-test-password", organizationName: "Food demo" })).status).toBe(201)
    expect((await other.post("/auth/workspace").send({ email: "other@universal.test", password: "universal-test-password", organizationName: "Other demo" })).status).toBe(201)
    expect((await owner.get("/workspace/settings")).body.settings.template).toBe("college_it")
    expect((await owner.put("/workspace/settings").send({ ...WORKSPACE_TEMPLATES["food_delivery"], imageScreening: false })).status).toBe(200)
    const requester = request.agent(app)
    const invite = (await owner.post("/support/requester-invite")).body.invite
    expect((await requester.post("/auth/signup").send({ invite, email: "requester@universal.test", password: "requester-password" })).status).toBe(201)
    expect((await requester.get("/workspace/settings")).status).toBe(200)
    expect((await requester.put("/workspace/settings").send(WORKSPACE_TEMPLATES["college_it"])).status).toBe(401)
    expect((await requester.get("/workspace/integration")).status).toBe(401)
    expect((await requester.post("/workspace/keys").send({ name: "Forbidden" })).status).toBe(401)
    const key = (await owner.post("/workspace/keys").send({ name: "Demo backend" })).body
    const otherKey = (await other.post("/workspace/keys").send({ name: "Other backend" })).body
    const webhook = await owner.put("/workspace/webhook").send({ url: "https://receiver.example.com/events" })
    expect(webhook.body.secret).toHaveLength(64)
    expect(JSON.stringify((await owner.get("/auth/me")).body)).not.toContain(webhook.body.secret)
    const data = await sharp({ create: { width: 224, height: 224, channels: 3, background: "red" } }).png().toBuffer()
    const payload = { title: "Order arrived damaged", description: "Please review my order", timestamp: new Date().toISOString(), external_ticket_id: "order-42", external_customer_id: "customer-2", metadata: { order_id: "42" }, images: [{ name: "food.png", base64: data.toString("base64") }] }
    const submissions = await Promise.all([1, 2].map(() => request(app).post("/tickets").set("X-API-Key", key.key).set("Idempotency-Key", "order-42-v1").send(payload)))
    expect(submissions.map(value => value.status)).toEqual([202, 202])
    const id = submissions[0]!.body.id
    expect(submissions[1]!.body.id).toBe(id)
    expect(await SupportTicketModel.countDocuments()).toBe(1)
    expect((await request(app).post("/tickets").set("X-API-Key", key.key).set("Idempotency-Key", "order-42-v1").send({ ...payload, title: "Different" })).status).toBe(409)
    expect((await request(app).get(`/tickets/${id}`).set("X-API-Key", otherKey.key)).status).toBe(404)
    // Simulate a crashed worker's expired lease, then start another processing attempt.
    await SupportTicketModel.updateOne({ _id: id }, { $set: { jobStatus: "processing", jobLeaseUntil: new Date(0), jobToken: "dead-process" } })
    // Simulate the same crash after an AI result was persisted but before ticket completion.
    await AiResultModel.create({ ticketId: id, version: 1, result: { category: "Other", priority: "Medium", summary: "Order damaged", root_cause: "Unknown", suggested_resolution: "Review order", confidence: .8, auto_resolve: false }, provider: "mock", model: "mock-stub", processingMs: 1 })
    await ticketQueue.runOnce()
    const detail = await request(app).get(`/tickets/${id}`).set("X-API-Key", key.key)
    expect(detail.body.status).toBe("processed")
    expect(detail.body.workflow.team).toBe("Customer Support")
    expect(detail.body.images[0].status).toBe("disabled")
    expect(detail.body.images[0]).not.toHaveProperty("data")
    expect((await request(app).get(detail.body.images[0].url).set("X-API-Key", key.key)).body).toEqual(data)
    expect((await request(app).get(detail.body.images[0].url).set("X-API-Key", otherKey.key)).status).toBe(404)
    expect((await request(app).get("/tickets/external/order-42").set("X-API-Key", key.key)).body.tickets).toHaveLength(1)
    expect((await request(app).get("/tickets/external/order-42").set("X-API-Key", otherKey.key)).body.tickets).toHaveLength(0)
    expect((await SupportTicketModel.findById(id))?.jobStatus).toBe("completed")
    await dispatchOutbox(); await dispatchOutbox()
    expect(await WebhookDeliveryModel.countDocuments()).toBe(1)
    send.mockResolvedValueOnce(500)
    await deliverWebhook()
    expect((await WebhookDeliveryModel.findOne())?.status).toBe("pending")
    await WebhookDeliveryModel.updateMany({}, { $set: { nextAt: new Date(0) } })
    await deliverWebhook()
    expect((await WebhookDeliveryModel.findOne())?.status).toBe("delivered")
    expect(send).toHaveBeenCalledTimes(2)
    expect(JSON.parse(send.mock.calls[0]![3] as string)).toMatchObject({ type: "analysis.completed", external_ticket_id: "order-42" })
    const revision = detail.body.workflow.revision
    expect((await owner.patch(`/tickets/${id}/handoff`).send({ action: "assign", team: "IT Helpdesk", expected_revision: revision })).status).toBe(400)
    expect((await owner.patch(`/tickets/${id}/handoff`).send({ action: "assign", team: "Refund Review", expected_revision: revision })).status).toBe(200)
    await dispatchOutbox()
    expect(await WebhookDeliveryModel.countDocuments()).toBe(2)
    await owner.put("/workspace/webhook").send({ url: "" })
    await deliverWebhook()
    expect(await WebhookDeliveryModel.countDocuments({ status: "canceled" })).toBe(1)
    expect((await owner.delete(`/workspace/keys/${key.id}`)).status).toBe(200)
    expect((await request(app).get(`/tickets/${id}`).set("X-API-Key", key.key)).status).toBe(401)
  }, 30000)
})
