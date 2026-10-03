import { describe, expect, it, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { Types } from "mongoose"

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() }
}))

vi.mock("../lib/stripe.js", () => ({
  stripe: mockStripe
}))

vi.mock("../middleware/require-auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => next()
}))

import { billingRouter } from "../modules/billing/billing.routes.js"
import { OrganizationModel } from "../models/Organization.js"
import { errorHandler } from "../middleware/error-handler.js"

describe("Billing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Checkout Session", () => {
    it("creates checkout session for owner/admin", async () => {
      const orgId = new Types.ObjectId()
      const app = express()
      app.use(express.json())
      app.use((req, _res, next) => {
        req.auth = { organizationId: orgId.toString(), role: "owner" }
        next()
      })
      app.use("/billing", billingRouter)
      app.use(errorHandler)

      vi.spyOn(OrganizationModel, "findById").mockResolvedValue({
        _id: orgId,
        name: "Test Org",
        stripeCustomerId: null,
        save: vi.fn().mockResolvedValue(true)
      } as any)

      mockStripe.customers.create.mockResolvedValue({ id: "cus_123" })
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: "http://checkout.stripe.com/123" })

      const response = await request(app)
        .post("/billing/checkout-session")
        .send({ plan: "growth" })

      expect(response.status).toBe(200)
      expect(response.body.url).toBe("http://checkout.stripe.com/123")
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        customer: "cus_123",
        mode: "subscription"
      }))
    })

    it("rejects checkout session for member role", async () => {
      const orgId = new Types.ObjectId()
      const app = express()
      app.use(express.json())
      app.use((req, _res, next) => {
        req.auth = { organizationId: orgId.toString(), role: "employee" } // not owner or admin
        next()
      })
      app.use("/billing", billingRouter)
      app.use(errorHandler)

      const response = await request(app)
        .post("/billing/checkout-session")
        .send({ plan: "growth" })

      expect(response.status).toBe(401)
    })
  })

  describe("Webhook Handler", () => {
    it("handles customer.subscription.updated idempotently", async () => {
      const orgId = new Types.ObjectId()
      const app = express()
      // Webhook applies raw json mapping specifically
      app.use("/billing/webhook", express.raw({ type: "application/json" }))
      app.use("/billing", billingRouter)

      const mockOrg = {
        _id: orgId,
        plan: "trial",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: null,
        subscriptionStatus: "trialing",
        monthlyTicketQuota: 50,
        save: vi.fn().mockResolvedValue(true)
      }
      vi.spyOn(OrganizationModel, "findOne").mockResolvedValue(mockOrg as any)

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            customer: "cus_123",
            id: "sub_123",
            status: "active",
            current_period_end: 1712345678,
            items: {
              data: [
                { price: { id: "price_1" } } // mock starter
              ]
            }
          }
        }
      })

      const sendWebhook = () => request(app)
        .post("/billing/webhook")
        .set("stripe-signature", "fake-sig")
        .send(JSON.stringify({ fake: true }))

      const res1 = await sendWebhook()
      expect(res1.status).toBe(200)
      expect(mockOrg.plan).toBe("starter")
      expect(mockOrg.subscriptionStatus).toBe("active")
      expect(mockOrg.stripeSubscriptionId).toBe("sub_123")
      expect(mockOrg.monthlyTicketQuota).toBe(500)
      expect(mockOrg.save).toHaveBeenCalledTimes(1)

      // Send identical event again
      const res2 = await sendWebhook()
      expect(res2.status).toBe(200)
      
      // Idempotency check: state is exactly identical
      expect(mockOrg.plan).toBe("starter")
      expect(mockOrg.subscriptionStatus).toBe("active")
      expect(mockOrg.save).toHaveBeenCalledTimes(2) // save is called, but no fields drifted
    })
    
    it("handles customer.subscription.deleted by downgrading", async () => {
      const orgId = new Types.ObjectId()
      const app = express()
      app.use("/billing/webhook", express.raw({ type: "application/json" }))
      app.use("/billing", billingRouter)

      const mockOrg = {
        _id: orgId,
        plan: "starter",
        stripeCustomerId: "cus_123",
        subscriptionStatus: "active",
        monthlyTicketQuota: 500,
        save: vi.fn().mockResolvedValue(true)
      }
      vi.spyOn(OrganizationModel, "findOne").mockResolvedValue(mockOrg as any)

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            customer: "cus_123",
            id: "sub_123",
            status: "canceled",
            current_period_end: 1712345678
          }
        }
      })

      const res = await request(app)
        .post("/billing/webhook")
        .set("stripe-signature", "fake-sig")
        .send(JSON.stringify({ fake: true }))

      expect(res.status).toBe(200)
      expect(mockOrg.plan).toBe("trial")
      expect(mockOrg.subscriptionStatus).toBe("canceled")
      expect(mockOrg.monthlyTicketQuota).toBe(50) // Fallback to trial quota
    })
  })
})
