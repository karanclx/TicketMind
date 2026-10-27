import type { Request, Response } from "express"
import { validatePayload } from "../../lib/validate.js"
import { checkoutSessionSchema } from "./billing.schemas.js"
import { billingService } from "./billing.service.js"
import { logger } from "../../config/logger.js"

export class BillingController {
  public async createCheckoutSession(req: Request, res: Response) {
    const input = validatePayload(checkoutSessionSchema, req.body)
    const url = await billingService.createCheckoutSession(req.auth!.organizationId, input.plan)
    res.status(200).json({ url })
  }

  public async createPortalSession(req: Request, res: Response) {
    const url = await billingService.createPortalSession(req.auth!.organizationId)
    res.status(200).json({ url })
  }

  public async handleWebhook(req: Request, res: Response) {
    const signature = req.headers["stripe-signature"]
    if (typeof signature !== "string") {
      res.status(400).send("Missing Stripe signature")
      return
    }

    try {
      const body: unknown = req.body
      if (!Buffer.isBuffer(body)) {
        res.status(400).send("Expected raw webhook body")
        return
      }
      await billingService.handleWebhook(signature, body)
      res.status(200).send({ received: true })
    } catch (error: unknown) {
      logger.error({ error }, "Stripe webhook failed")
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).send(`Webhook Error: ${msg}`)
    }
  }
}

export const billingController = new BillingController()
