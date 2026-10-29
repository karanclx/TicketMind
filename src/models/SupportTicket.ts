import { SUPPORT_TEAMS, WORKFLOW_STATES } from "../modules/support/support-policy.js"
import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"
import type { TicketUserRole } from "../ticket-intelligence/types.js"

const rawInputSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    userRole: { type: String, required: true, trim: true, enum: ["student", "employee", "admin"] },
    timestamp: { type: Date, required: true }
  },
  { _id: false }
)

const supportTicketSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    workflowStatus: { type: String, enum: WORKFLOW_STATES, default: "awaiting_ai", index: true },
    assignedTeam: { type: String, enum: SUPPORT_TEAMS, default: "IT Helpdesk" },
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
      status: { type: String, enum: ["pending", "low_signal", "inconclusive", "review_required", "unavailable"], default: "pending" },
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