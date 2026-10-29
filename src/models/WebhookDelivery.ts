import { Schema, model } from "mongoose"
const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
  eventId: { type: String, required: true, unique: true },
  endpoint: { type: String, required: true },
  secret: { type: String, required: true, select: false },
  body: { type: String, required: true, select: false },
  status: { type: String, default: "pending", enum: ["pending", "processing", "delivered", "failed", "canceled"] },
  attempts: { type: Number, default: 0 },
  nextAt: { type: Date, default: Date.now },
  leaseUntil: Date, token: String, lastStatus: Number
}, { timestamps: true })
schema.index({ status: 1, nextAt: 1, leaseUntil: 1 })
export const WebhookDeliveryModel = model("WebhookDelivery", schema)
