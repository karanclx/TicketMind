import { stripe } from "../../lib/stripe.js"
import { env } from "../../config/env.js"
import { OrganizationModel, PLAN_QUOTAS } from "../../models/Organization.js"
import { NotFoundError } from "../../lib/errors.js"

export class BillingService {
  public async createCheckoutSession(organizationId: string, plan: "starter" | "growth"): Promise<string> {
    const organization = await OrganizationModel.findById(organizationId)
    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    let customerId = organization.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        metadata: {
          organizationId: organization._id.toString()
        }
      })
      customerId = customer.id
      organization.stripeCustomerId = customerId
      await organization.save()
    }

    const priceId = plan === "starter" ? env.STRIPE_PRICE_ID_STARTER : env.STRIPE_PRICE_ID_GROWTH

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      // We will redirect to frontend routes /billing/success and /billing/cancel
      success_url: `http://localhost:${env.PORT}/billing/success`,
      cancel_url: `http://localhost:${env.PORT}/billing/cancel`,
      metadata: {
        organizationId: organization._id.toString(),
        plan
      }
    })

    if (!session.url) {
      throw new Error("Failed to create Stripe Checkout session")
    }

    return session.url
  }

  public async createPortalSession(organizationId: string): Promise<string> {
    const organization = await OrganizationModel.findById(organizationId)
    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    if (!organization.stripeCustomerId) {
      throw new NotFoundError("No billing account found for this organization")
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `http://localhost:${env.PORT}/`
    })

    return session.url
  }

  public async handleWebhook(signature: string, rawBody: Buffer): Promise<void> {
    let event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
    } catch (err: any) {
      throw new Error(`Webhook Error: ${err.message}`)
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        if (session.mode === "subscription" && session.subscription) {
          const organizationId = session.metadata?.["organizationId"]
          if (organizationId) {
            const org = await OrganizationModel.findById(organizationId)
            if (org && !org.stripeSubscriptionId) {
              org.stripeSubscriptionId = session.subscription as string
              await org.save()
            }
          }
        }
        break
      }
      
      case "customer.subscription.updated": {
        const subscription = event.data.object
        await this.syncSubscriptionToOrg(subscription)
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object
        await this.syncSubscriptionToOrg(subscription)
        break
      }

      default:
        // Acknowledge unhandled events
        break
    }
  }

  private async syncSubscriptionToOrg(subscription: any): Promise<void> {
    const customerId = subscription.customer as string
    const org = await OrganizationModel.findOne({ stripeCustomerId: customerId })
    
    if (!org) {
      // Nothing to do if we can't find the organization
      return
    }

    // Determine plan from price ID
    const priceId = subscription.items?.data[0]?.price?.id
    let plan = org.plan

    // Only map paid plans if the subscription is not deleted
    if (subscription.status !== "canceled") {
      if (priceId === env.STRIPE_PRICE_ID_STARTER) {
        plan = "starter"
      } else if (priceId === env.STRIPE_PRICE_ID_GROWTH) {
        plan = "growth"
      }
    } else {
      plan = "trial"
    }

    const quota = PLAN_QUOTAS[plan as "trial" | "starter" | "growth"] ?? PLAN_QUOTAS["trial"]

    // Update organization safely. Stripe can redeliver these events.
    // The operation is fully idempotent: if we receive identical state, we simply overwrite it.
    org.stripeSubscriptionId = subscription.id
    org.subscriptionStatus = subscription.status
    org.currentPeriodEnd = new Date(subscription.current_period_end * 1000)
    org.plan = plan
    org.monthlyTicketQuota = quota

    await org.save()
  }
}

export const billingService = new BillingService()
