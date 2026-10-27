import { requireRole } from "../../middleware/require-role.js"
import { SUPPORT_ROLES } from "../support/support-policy.js"
import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { healthController } from "./health.controller.js"

import { requireAuth } from "../../middleware/require-auth.js"

export const healthRouter = Router()

healthRouter.get("/live", (_req, res) => { res.json({ status: "ok" }) })

healthRouter.get("/", requireAuth, requireRole(SUPPORT_ROLES), asyncHandler(healthController.getHealth.bind(healthController)))
