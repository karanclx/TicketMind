import { randomUUID } from "node:crypto"
import { z } from "zod"
import { OrganizationModel } from "../../models/Organization.js"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import { WebhookDeliveryModel } from "../../models/WebhookDelivery.js"
import { sendWebhook } from "./webhook.transport.js"
const eventSchema = z.object({ id: z.string(), type: z.string(), ticket_id: z.string(), created_at: z.string(), data: z.record(z.unknown()) })
export async function dispatchOutbox() {
  const ticket = await SupportTicketModel.findOne({ "pendingEvents.0": { $exists: true } }).select("+pendingEvents")
  if (!ticket) return
  const organization = await OrganizationModel.findById(ticket.organizationId).select("+webhookSecret")
  for (const raw of ticket.pendingEvents) {
    const event = eventSchema.parse(raw)
    if (organization?.webhookUrl && organization.webhookSecret) {
      await WebhookDeliveryModel.updateOne({ eventId: event.id }, { $setOnInsert: {
        organizationId: ticket.organizationId, eventId: event.id, endpoint: organization.webhookUrl, secret: organization.webhookSecret,
        body: JSON.stringify({ ...event, organization_id: ticket.organizationId.toString(), external_ticket_id: ticket.externalTicketId ?? null })
      } }, { upsert: true })
    }
    await SupportTicketModel.updateOne({ _id: ticket._id }, { $pull: { pendingEvents: { id: event.id } } })
  }
}
export async function deliverWebhook() {
  const token = randomUUID(), now = new Date()
  const delivery = await WebhookDeliveryModel.findOneAndUpdate({ $or: [ { status: "pending", nextAt: { $lte: now } }, { status: "processing", leaseUntil: { $lte: now } } ] }, {
    $set: { status: "processing", token, leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 }
  }, { new: true, sort: { nextAt: 1 } }).select("+secret +body")
  if (!delivery) return
  let status = 0
  const org = await OrganizationModel.findById(delivery.organizationId).select("+webhookSecret")
  const canceled = !org || org.webhookUrl !== delivery.endpoint || org.webhookSecret !== delivery.secret
  if (!canceled && delivery.attempts <= 6) {
    try { status = await sendWebhook(delivery.endpoint, delivery.secret, delivery.eventId, delivery.body) } catch { /* retry without storing secrets or response bodies */ }
  }
  await WebhookDeliveryModel.updateOne({ _id: delivery._id, token }, { $set: {
    status: canceled ? "canceled" : status >= 200 && status < 300 ? "delivered" : delivery.attempts >= 6 ? "failed" : "pending",
    lastStatus: status, nextAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** delivery.attempts))
  }, $unset: { token: 1, leaseUntil: 1 } })
}
