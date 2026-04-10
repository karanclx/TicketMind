import type { Request, Response } from "express"

import { validatePayload } from "../../lib/validate.js"
import { ticketQueue } from "../tickets/ticket.module.js"
import { z } from "zod"

const healthQuerySchema = z.object({
  job_id: z.string().uuid().optional(),
  include_dead_letter: z.union([z.literal("true"), z.literal("false")]).optional()
})

export class HealthController {
  public async getHealth(_req: Request, res: Response): Promise<void> {
    const query = validatePayload(healthQuerySchema, _req.query)
    const queue = ticketQueue.stats()
    const includeDeadLetter = query.include_dead_letter === "true"
    const jobStatus = query.job_id ? ticketQueue.getJobStatus(query.job_id) : null
    const deadLetter = includeDeadLetter ? ticketQueue.deadLetterJobs() : undefined

    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      queue,
      job: jobStatus,
      dead_letter: deadLetter
    })
  }
}

export const healthController = new HealthController()
