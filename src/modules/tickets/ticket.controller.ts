import type { Request, Response } from "express"

import { validatePayload } from "../../lib/validate.js"
import { createTicketSchema, ticketIdParamSchema } from "./ticket.schemas.js"
import { ticketService } from "./ticket.service.js"
import { ticketQueue } from "./ticket.module.js"

export class TicketController {
  public async createTicket(req: Request, res: Response): Promise<void> {
    const payload = validatePayload(createTicketSchema, req.body)
    const organizationId = req.auth!.organizationId
    
    const created = await ticketService.createTicket(payload, organizationId)
    const queued = ticketQueue.enqueue(created.id, organizationId, false)

    res.status(202).json({
      id: created.id,
      status: "queued",
      job_id: queued.jobId
    })
  }

  public async getTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const organizationId = req.auth!.organizationId
    
    const ticket = await ticketService.getTicketById(id, organizationId)
    res.status(200).json(ticket)
  }

  public async processTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const organizationId = req.auth!.organizationId
    
    // Verify tenant first (getTicketById throws if it doesn't match or exist)
    await ticketService.getTicketById(id, organizationId)
    
    const queued = ticketQueue.enqueue(id, organizationId, true)

    res.status(202).json({
      id,
      status: "queued",
      job_id: queued.jobId
    })
  }
}

export const ticketController = new TicketController()
