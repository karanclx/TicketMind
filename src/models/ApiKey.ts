import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"

const apiKeySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true, select: false },
    keyPrefix: { type: String, required: true },
    lastUsedAt: { type: Date, required: false },
    revokedAt: { type: Date, required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export type ApiKey = InferSchemaType<typeof apiKeySchema> & {
  _id: Types.ObjectId
}

export const ApiKeyModel: Model<ApiKey> = model<ApiKey>("ApiKey", apiKeySchema)
