import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { healthController } from "./health.controller.js"

export const healthRouter = Router()

healthRouter.get("/", asyncHandler(healthController.getHealth.bind(healthController)))
