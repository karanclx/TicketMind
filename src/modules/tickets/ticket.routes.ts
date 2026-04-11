import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { ticketController } from "./ticket.controller.js"

export const ticketRouter = Router()

ticketRouter.post("/", asyncHandler(ticketController.createTicket.bind(ticketController)))
ticketRouter.get("/:id", asyncHandler(ticketController.getTicket.bind(ticketController)))
ticketRouter.post("/:id/process", asyncHandler(ticketController.processTicket.bind(ticketController)))
