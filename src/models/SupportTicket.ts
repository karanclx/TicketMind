import { randomUUID } from "node:crypto"
import { WORKFLOW_STATES } from "../modules/support/support-policy.js"
import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"
import type { TicketUserRole } from "../ticket-intelligence/types.js"

const rawInputSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    userRole: { type: String, required: true, trim: true, enum: ["student", "employee", "admin", "customer"] },
    timestamp: { type: Date, required: true }
  },
  { _id: false }
)

const supportTicketSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    externalTicketId: { type: String },
    externalCustomerId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    idempotencyKey: { type: String, select: false },
    requestHash: { type: String, select: false },
    jobId: { type: String, default: randomUUID },
    jobStatus: { type: String, default: "queued", enum: ["queued", "processing", "retrying", "completed", "dead_letter"] },
    jobAttempts: { type: Number, default: 0 },
    jobNextAt: { type: Date, default: Date.now },
    jobLeaseUntil: { type: Date },
    jobToken: { type: String },
    jobError: { type: String },
    pendingEvents: { type: [Schema.Types.Mixed], default: [], select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    workflowStatus: { type: String, enum: WORKFLOW_STATES, default: "awaiting_ai", index: true },
    assignedTeam: { type: String, default: "IT Helpdesk" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    handoffReason: { type: String, default: "" },
    handoffRevision: { type: Number, default: 0 },
    triageCategory: { type: String, default: "Other" },
    triagePriority: { type: String, default: "Medium" },
    resolutionNote: { type: String, default: "" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    images: { type: [new Schema({
      name: { type: String, required: true },
      mime: { type: String, required: true },
      data: { type: Buffer, required: true, select: false },
      status: { type: String, enum: ["pending", "low_signal", "inconclusive", "review_required", "unavailable", "disabled"], default: "pending" },
      score: { type: Number, default: null },
      detectorModel: { type: String, default: "" },
      checkedAt: { type: Date, default: null }
    })], default: [] },
    rawInput: { type: rawInputSchema, required: true },
    normalizedTitle: { type: String, required: true, trim: true },
    normalizedDescription: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "processed", "failed"],
      default: "pending"
    },
    latestAiResultId: { type: Schema.Types.ObjectId, ref: "AiResult", required: false },
    reprocessCount: { type: Number, required: true, default: 0, min: 0 },
    aiVersion: { type: Number, required: true, default: 0, min: 0 },
    lastProcessedAt: { type: Date, required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

supportTicketSchema.index({ organizationId: 1, workflowStatus: 1, assignedTeam: 1, createdAt: -1 })

supportTicketSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } })
supportTicketSchema.index({ jobStatus: 1, jobNextAt: 1, jobLeaseUntil: 1 })
supportTicketSchema.index({ organizationId: 1, externalTicketId: 1 })
supportTicketSchema.index({ status: 1, createdAt: -1 })
supportTicketSchema.index({ organizationId: 1, status: 1, createdAt: -1 })

export type SupportTicket = InferSchemaType<typeof supportTicketSchema> & {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  rawInput: {
    title: string
    description: string
    userRole: TicketUserRole
    timestamp: Date
  }
  latestAiResultId?: Types.ObjectId
}

export const SupportTicketModel: Model<SupportTicket> = model<SupportTicket>(
  "SupportTicket",
  supportTicketSchema
)