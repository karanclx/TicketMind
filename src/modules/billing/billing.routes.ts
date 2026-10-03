import { Router } from "express"
import { asyncHandler } from "../../lib/async-handler.js"
import { billingController } from "./billing.controller.js"
import { requireAuth } from "../../middleware/require-auth.js"
import { requireRole } from "../../middleware/require-role.js"
import express from "express"

export const billingRouter = Router()

// Owner/admin routes for checkout and portal
billingRouter.post(
  "/checkout-session",
  requireAuth,
  requireRole(["owner", "admin"]),
  asyncHandler(billingController.createCheckoutSession.bind(billingController))
)

billingRouter.get(
  "/portal-session",
  requireAuth,
  requireRole(["owner", "admin"]),
  asyncHandler(billingController.createPortalSession.bind(billingController))
)

// The webhook needs the raw body for signature verification.
// express.raw() is applied globally in app.ts for this specific path.
billingRouter.post(
  "/webhook",
  asyncHandler(billingController.handleWebhook.bind(billingController))
)
