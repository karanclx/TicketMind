import { z } from "zod"
import { SUPPORT_ROLES } from "../support/support-policy.js"
import type { Request, Response } from "express"

import { validatePayload } from "../../lib/validate.js"
import { createTicketSchema, ticketIdParamSchema } from "./ticket.schemas.js"
import { ticketService } from "./ticket.service.js"
import { ticketQueue } from "./ticket.module.js"

export class TicketController {
  public async createTicket(req: Request, res: Response): Promise<void> {
    const payload = createTicketSchema.parse(req.body)
    const organizationId = req.auth!.organizationId
    
    const created = await ticketService.createTicket(payload, organizationId, req.auth?.userId, req.headers["idempotency-key"] === undefined ? undefined : z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/).parse(req.headers["idempotency-key"]))
    const queued = await ticketQueue.enqueue(created.id, organizationId, false)

    res.status(202).json({
      id: created.id,
      replayed: created.replayed ?? false,
      status: queued.status ?? "queued",
      job_id: queued.jobId
    })
  }

  public async getTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const organizationId = req.auth!.organizationId
    
    const requesterId = !req.auth!.apiKeyId && !SUPPORT_ROLES.includes(req.auth!.role ?? "") ? req.auth!.userId : undefined
    const ticket = await ticketService.getTicketById(id, organizationId, requesterId)
    res.status(200).json(ticket)
  }

  public async processTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const organizationId = req.auth!.organizationId
    
    // Verify tenant first (getTicketById throws if it doesn't match or exist)
    await ticketService.getTicketById(id, organizationId)
    
    const queued = await ticketQueue.enqueue(id, organizationId, true)

    res.status(202).json({
      id,
      status: queued.status ?? "queued",
      job_id: queued.jobId
    })
  }
}

export const ticketController = new TicketController()
