import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"

const aiResultSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "SupportTicket", required: true },
    version: { type: Number, required: true, min: 1 },
    result: { type: Schema.Types.Mixed, required: true },
    provider: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    processingMs: { type: Number, required: true, min: 0 }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

aiResultSchema.index({ ticketId: 1, version: -1 }, { unique: true })

export type AiResult = InferSchemaType<typeof aiResultSchema> & {
  _id: Types.ObjectId
}

export const AiResultModel: Model<AiResult> = model<AiResult>("AiResult", aiResultSchema)