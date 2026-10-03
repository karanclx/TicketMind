import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { ticketController } from "./ticket.controller.js"

import { tryAuthThenApiKey } from "../../middleware/try-auth-then-api-key.js"
import { requireAuth } from "../../middleware/require-auth.js"

export const ticketRouter = Router()

ticketRouter.post("/", tryAuthThenApiKey, asyncHandler(ticketController.createTicket.bind(ticketController)))
ticketRouter.get("/:id", tryAuthThenApiKey, asyncHandler(ticketController.getTicket.bind(ticketController)))
ticketRouter.post("/:id/process", tryAuthThenApiKey, asyncHandler(ticketController.processTicket.bind(ticketController)))
