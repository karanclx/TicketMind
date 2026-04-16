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

supportTicketSchema.index({ status: 1, createdAt: -1 })

export type SupportTicket = InferSchemaType<typeof supportTicketSchema> & {
  _id: Types.ObjectId
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