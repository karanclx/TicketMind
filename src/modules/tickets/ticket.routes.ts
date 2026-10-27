import { AppError } from "../../lib/errors.js"
import { SUPPORT_ROLES } from "../support/support-policy.js"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import { z } from "zod"
import { requireAuth } from "../../middleware/require-auth.js"
import { supportService } from "../support/support.service.js"
import { handoffSchema } from "../support/support.schemas.js"
import { ticketIdParamSchema } from "./ticket.schemas.js"

import { Router } from "express"

import { asyncHandler } from "../../lib/async-handler.js"
import { ticketController } from "./ticket.controller.js"

import { tryAuthThenApiKey } from "../../middleware/try-auth-then-api-key.js"

export const ticketRouter = Router()

ticketRouter.post("/", asyncHandler(tryAuthThenApiKey), asyncHandler(ticketController.createTicket.bind(ticketController)))
ticketRouter.get("/mine", requireAuth, asyncHandler(async (req, res) => {
  const page = z.coerce.number().int().min(1).default(1).parse(req.query["page"])
  const filter = { organizationId: req.auth!.organizationId, createdBy: req.auth!.userId }
  const [tickets, total] = await Promise.all([
    SupportTicketModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).select("normalizedTitle workflowStatus status createdAt assignedTeam resolutionNote").lean(),
    SupportTicketModel.countDocuments(filter)
  ])
  res.json({ tickets: tickets.map(ticket => ({
    id: ticket._id.toString(), title: ticket.normalizedTitle,
    status: ticket.workflowStatus ?? (["processed", "failed"].includes(ticket.status) ? "needs_human" : "awaiting_ai"),
    team: ticket.assignedTeam ?? "IT Helpdesk", created_at: ticket.createdAt
  })), total, page, page_size: 25 })
}))
ticketRouter.get("/:id", asyncHandler(tryAuthThenApiKey), asyncHandler(ticketController.getTicket.bind(ticketController)))
ticketRouter.post("/:id/process", asyncHandler(tryAuthThenApiKey), (req, _res, next) => {
  if (!req.auth?.apiKeyId && !SUPPORT_ROLES.includes(req.auth?.role ?? "")) throw new AppError("Only support staff can reprocess tickets", 403, "FORBIDDEN")
  next()
}, asyncHandler(ticketController.processTicket.bind(ticketController)))

ticketRouter.patch("/:id/handoff", requireAuth, asyncHandler(async (req, res) => {
  const { id } = ticketIdParamSchema.parse(req.params)
  res.json(await supportService.update(id, req.auth!, handoffSchema.parse(req.body)))
}))
