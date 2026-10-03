import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose"

export type Plan = "trial" | "starter" | "growth"

export const PLAN_QUOTAS: Record<Plan, number> = {
  trial: 50,
  starter: 500,
  growth: 5000
}

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    plan: { type: String, enum: ["trial", "starter", "growth"], default: "trial" },
    monthlyTicketQuota: { type: Number, default: PLAN_QUOTAS["trial"] },
    ticketsProcessedThisCycle: { type: Number, default: 0 },
    cycleResetAt: { type: Date, required: false },
    stripeCustomerId: { type: String, required: false, index: true },
    stripeSubscriptionId: { type: String, required: false },
    subscriptionStatus: { 
      type: String, 
      enum: ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"], 
      default: "trialing" 
    },
    currentPeriodEnd: { type: Date, required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export type Organization = InferSchemaType<typeof organizationSchema> & {
  _id: Types.ObjectId
}

export const OrganizationModel: Model<Organization> = model<Organization>("Organization", organizationSchema)
