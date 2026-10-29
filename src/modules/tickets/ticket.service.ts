import { prepareImages, analyzeImage } from "../evidence/evidence.service.js"
import { handoffDecision } from "../support/support-policy.js"

import { resetMonthlyUsage } from "./usage-cycle.js"
import { env } from "../../config/env.js"

import { Types } from "mongoose"

import { NotFoundError } from "../../lib/errors.js"
import { aiPipelineService } from "../ai-pipeline/ai-pipeline.service.js"
import { analyzeTicket } from "../../ticket-intelligence/analyzer.js"
import { AiResultModel } from "../../models/AiResult.js"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import { OrganizationModel } from "../../models/Organization.js"
import type { CreateTicketInput } from "./ticket.schemas.js"

export class TicketService {
  public async createTicket(input: CreateTicketInput, organizationId: string, createdBy?: string): Promise<{ id: string }> {
    const normalizedTitle = input.title.trim()
    const normalizedDescription = input.description.trim()

    const images = await prepareImages(input.images ?? [])
    const ticket = await SupportTicketModel.create({
      images,
      organizationId: new Types.ObjectId(organizationId),
      rawInput: {
        title: input.title,
        description: input.description,
        userRole: input.user_role,
        timestamp: new Date(input.timestamp)
      },
      ...(createdBy ? { createdBy: new Types.ObjectId(createdBy) } : {}),
      normalizedTitle,
      normalizedDescription,
      status: "pending"
    })

    return { id: ticket._id.toString() }
  }

  public async getTicketById(id: string, organizationId: string, requesterId?: string): Promise<Record<string, unknown>> {
    const ticket = await SupportTicketModel.findOne({ _id: id, organizationId, ...(requesterId ? { createdBy: requesterId } : {}) }).lean()

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
      images: (ticket.images ?? []).map(image => ({
        id: image._id.toString(), name: image.name, status: image.status,
        score: image.score, model: image.detectorModel, checked_at: image.checkedAt,
        url: `/tickets/${id}/images/${image._id.toString()}`
      })),
      created_by: ticket.createdBy?.toString() ?? null,
      workflow: {
        status: ticket.workflowStatus ?? (["processed", "failed"].includes(ticket.status) ? "needs_human" : "awaiting_ai"),
        team: ticket.assignedTeam ?? "IT Helpdesk",
        assignee_id: ticket.assignedTo?.toString() ?? null,
        reason: ticket.handoffReason ?? "",
        revision: ticket.handoffRevision ?? 0,
        resolution_note: ticket.resolutionNote ?? "",
        resolved_at: ticket.resolvedAt ?? null
      },
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

      if (resetMonthlyUsage(organization)) {
        await organization.save()
      }

      const startedAt = performance.now()
      let aiOutputResult
      let provider = "llm-pipeline-v1"
      let model = "three-step-or-fallback"
      
      const isOverQuota = organization.ticketsProcessedThisCycle >= organization.monthlyTicketQuota
      const isSubscriptionInvalid = ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(organization.subscriptionStatus)

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
        const usedFallback = Object.values(pipelineResult.trace).includes("fallback")
        provider = usedFallback ? "deterministic-fallback" : env.LLM_PROVIDER
        model = usedFallback ? "keyword-analyzer" : env.LLM_PROVIDER === "mock" ? "mock-stub" : env.LLM_MODEL
        
        organization.ticketsProcessedThisCycle += 1
        await organization.save()
      }
      
      // Load private bytes only while processing, never in ticket JSON responses.
      if (ticket.images?.length) {
        const withBytes = await SupportTicketModel.findOne({ _id: id, organizationId }).select("+images.data")
        for (const image of withBytes?.images ?? []) {
          const result = image.data ? await analyzeImage(Buffer.from(image.data), image.mime) : { status: "unavailable", score: null, detectorModel: "", checkedAt: new Date() }
          const target = ticket.images.find(item => item._id.equals(image._id))
          if (target) Object.assign(target, result)
        }
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
      // Only initialize a handoff once. Never overwrite work already claimed or resolved by a human.
      const decision = handoffDecision(aiOutputResult, provider)
      if (ticket.images?.some(image => image.status !== "low_signal")) {
        decision.workflowStatus = "needs_human"
        decision.handoffReason = "Image evidence needs support review. Screening is inconclusive, flagged, or unavailable; it is not a fraud verdict."
      }
      await SupportTicketModel.updateOne({
        _id: id, organizationId,
        $or: [{ workflowStatus: "awaiting_ai" }, { workflowStatus: { $exists: false } }, ...(ticket.images?.some(image => image.status !== "low_signal") ? [{ workflowStatus: "awaiting_confirmation" }] : [])]
      }, { $set: decision, $inc: { handoffRevision: 1 } })
    } catch (error) {
      ticket.status = "failed"
      await ticket.save()
      await SupportTicketModel.updateOne({
        _id: id, organizationId,
        $or: [{ workflowStatus: "awaiting_ai" }, { workflowStatus: { $exists: false } }]
      }, { $set: { workflowStatus: "needs_human", assignedTeam: "IT Helpdesk", handoffReason: "Automatic processing failed; support staff review required." }, $inc: { handoffRevision: 1 } })
      throw error
    }
  }
}

export const ticketService = new TicketService()
