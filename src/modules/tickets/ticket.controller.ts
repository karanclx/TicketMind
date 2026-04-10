import type { Request, Response } from "express"

import { validatePayload } from "../../lib/validate.js"
import { createTicketSchema, ticketIdParamSchema } from "./ticket.schemas.js"
import { ticketService } from "./ticket.service.js"
import { ticketQueue } from "./ticket.module.js"

export class TicketController {
  public async createTicket(req: Request, res: Response): Promise<void> {
    const payload = validatePayload(createTicketSchema, req.body)
    const created = await ticketService.createTicket(payload)

    const queued = ticketQueue.enqueue(created.id, false)

    res.status(202).json({
      id: created.id,
      status: "queued",
      job_id: queued.jobId
    })
  }

  public async getTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const ticket = await ticketService.getTicketById(id)
    res.status(200).json(ticket)
  }

  public async processTicket(req: Request, res: Response): Promise<void> {
    const { id } = validatePayload(ticketIdParamSchema, req.params)
    const queued = ticketQueue.enqueue(id, true)

    res.status(202).json({
      id,
      status: "queued",
      job_id: queued.jobId
    })
  }
}

export const ticketController = new TicketController()
