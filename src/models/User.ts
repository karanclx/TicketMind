import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
    lastLoginAt: { type: Date, required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

userSchema.index({ organizationId: 1, email: 1 }, { unique: true })

export type User = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId
}

export const UserModel: Model<User> = model<User>("User", userSchema)
