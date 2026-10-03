import { Types } from "mongoose"

import { NotFoundError } from "../../lib/errors.js"
import { aiPipelineService } from "../ai-pipeline/ai-pipeline.service.js"
import { analyzeTicket } from "../../ticket-intelligence/analyzer.js"
import { AiResultModel } from "../../models/AiResult.js"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import { OrganizationModel } from "../../models/Organization.js"
import type { CreateTicketInput } from "./ticket.schemas.js"

export class TicketService {
  public async createTicket(input: CreateTicketInput, organizationId: string): Promise<{ id: string }> {
    const normalizedTitle = input.title.trim()
    const normalizedDescription = input.description.trim()

    const ticket = await SupportTicketModel.create({
      organizationId: new Types.ObjectId(organizationId),
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

  public async getTicketById(id: string, organizationId: string): Promise<Record<string, unknown>> {
    const ticket = await SupportTicketModel.findOne({ _id: id, organizationId }).lean()

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
            result: aiResult.result as unknown,
            processed_at: aiResult.createdAt
          }
        : null
    }
  }

  public async processTicketById(id: string, incrementReprocessCount: boolean, organizationId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Ticket not found")
    }

    const ticket = await SupportTicketModel.findOne({ _id: id, organizationId })

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
      const organization = await OrganizationModel.findById(organizationId)
      if (!organization) {
         throw new NotFoundError("Organization not found")
      }

      const startedAt = performance.now()
      let aiOutputResult
      let provider = "llm-pipeline-v1"
      let model = "three-step-or-fallback"
      
      const isOverQuota = organization.ticketsProcessedThisCycle >= organization.monthlyTicketQuota
      const isSubscriptionInvalid = ["past_due", "canceled"].includes(organization.subscriptionStatus)

      if (isOverQuota || isSubscriptionInvalid) {
        // Over quota or unpaid: skip LLM pipeline, fall back to deterministic analyzer directly
        aiOutputResult = analyzeTicket({ 
          title: ticket.normalizedTitle, 
          description: ticket.normalizedDescription,
          user_role: rawInput.userRole,
          timestamp: rawInput.timestamp.toISOString()
        })
        provider = "deterministic-fallback"
        model = "keyword-analyzer"
      } else {
        // Under quota: run pipeline and increment usage
        const pipelineResult = await aiPipelineService.processTicket({
          title: rawInput.title,
          description: rawInput.description,
          user_role: rawInput.userRole,
          timestamp: rawInput.timestamp.toISOString()
        })
        aiOutputResult = pipelineResult.result
        
        organization.ticketsProcessedThisCycle += 1
        await organization.save()
      }
      
      const processingMs = Math.round(performance.now() - startedAt)
      const nextVersion = ticket.aiVersion + 1
      
      const aiResult = await AiResultModel.create({
        ticketId: ticket._id,
        version: nextVersion,
        result: aiOutputResult,
        provider,
        model,
        processingMs
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
