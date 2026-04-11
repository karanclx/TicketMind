import { Types } from "mongoose"

import { NotFoundError } from "../../lib/errors.js"
import { aiPipelineService } from "../ai-pipeline/ai-pipeline.service.js"
import { AiResultModel } from "../../models/AiResult.js"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import type { CreateTicketInput } from "./ticket.schemas.js"

export class TicketService {
  public async createTicket(input: CreateTicketInput): Promise<{ id: string }> {
    const normalizedTitle = input.title.trim()
    const normalizedDescription = input.description.trim()

    const ticket = await SupportTicketModel.create({
      rawInput: {
        title: input.title,
        description: input.description,
        userRole: input.user_role,
        timestamp: new Date(input.timestamp)
      },
      normalizedTitle,
      normalizedDescription,
      status: "pending"
    })

    return { id: ticket._id.toString() }
  }

  public async getTicketById(id: string): Promise<Record<string, unknown>> {
    const ticket = await SupportTicketModel.findById(id).lean()

    if (!ticket) {
      throw new NotFoundError("Ticket not found")
    }

    const rawInput = ticket.rawInput
    if (!rawInput) {
      throw new NotFoundError("Ticket input not found")
    }

    const aiResult = ticket.latestAiResultId
      ? await AiResultModel.findById(ticket.latestAiResultId).lean()
      : null

    return {
      id: ticket._id.toString(),
      status: ticket.status,
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      raw_input: {
        title: rawInput.title,
        description: rawInput.description,
        user_role: rawInput.userRole,
        timestamp: rawInput.timestamp
      },
      normalized: {
        title: ticket.normalizedTitle,
        description: ticket.normalizedDescription
      },
      ai: aiResult
        ? {
            version: aiResult.version,
            provider: aiResult.provider,
            model: aiResult.model,
            result: aiResult.result,
            processed_at: aiResult.createdAt
          }
        : null
    }
  }

  public async processTicketById(id: string, incrementReprocessCount: boolean): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Ticket not found")
    }

    const ticket = await SupportTicketModel.findById(id)

    if (!ticket) {
      throw new NotFoundError("Ticket not found")
    }

    const rawInput = ticket.rawInput
    if (!rawInput) {
      throw new NotFoundError("Ticket input not found")
    }

    ticket.status = "processing"
    if (incrementReprocessCount) {
      ticket.reprocessCount += 1
    }
    await ticket.save()

    try {
      const pipelineResult = await aiPipelineService.processTicket({
        title: rawInput.title,
        description: rawInput.description,
        user_role: rawInput.userRole,
        timestamp: rawInput.timestamp.toISOString()
      })

      const nextVersion = ticket.aiVersion + 1
      const aiResult = await AiResultModel.create({
        ticketId: ticket._id,
        version: nextVersion,
        result: pipelineResult.result,
        provider: "llm-pipeline-v1",
        model: "three-step-or-fallback",
        processingMs: 1
      })

      ticket.latestAiResultId = aiResult._id
      ticket.aiVersion = nextVersion
      ticket.lastProcessedAt = new Date()
      ticket.status = "processed"
      await ticket.save()
    } catch (error) {
      ticket.status = "failed"
      await ticket.save()
      throw error
    }
  }
}

export const ticketService = new TicketService()
