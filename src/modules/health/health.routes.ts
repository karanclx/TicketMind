import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { healthController } from "./health.controller.js"

import { requireAuth } from "../../middleware/require-auth.js"

export const healthRouter = Router()

healthRouter.get("/", requireAuth, asyncHandler(healthController.getHealth.bind(healthController)))
