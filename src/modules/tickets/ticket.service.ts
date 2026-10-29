import type { AnalyzedTicket } from "../../ticket-intelligence/types.js"
import { createHash } from "node:crypto"
import { settingsFor } from "../workspace/workspace.settings.js"
import { AppError } from "../../lib/errors.js"
import { ticketEvent } from "../integrations/events.js"
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
  public async createTicket(input: CreateTicketInput, organizationId: string, createdBy?: string, idempotencyKey?: string): Promise<{ id: string; replayed?: boolean }> {
    const normalizedTitle = input.title.trim()
    const normalizedDescription = input.description.trim()

    const canonical = { ...input, metadata: Object.fromEntries(Object.entries(input.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b))) }
    const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
    const findReplay = async () => {
      const existing = await SupportTicketModel.findOne({ organizationId, idempotencyKey }).select("+requestHash")
      if (!existing) return null
      if (existing.requestHash !== requestHash || existing.createdBy?.toString() !== createdBy) throw new AppError("Idempotency key already used for a different request", 409, "IDEMPOTENCY_CONFLICT")
      return { id: existing._id.toString(), replayed: true }
    }
    if (idempotencyKey) { const replay = await findReplay(); if (replay) return replay }
    const workspace = settingsFor(await OrganizationModel.findById(organizationId))
    const images = await prepareImages(input.images ?? [])
    try {
    const ticket = await SupportTicketModel.create({
      ...(idempotencyKey ? { idempotencyKey, requestHash } : {}),
      externalTicketId: input.external_ticket_id, externalCustomerId: input.external_customer_id, metadata: input.metadata,
      images, assignedTeam: workspace.teams[0],
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
    } catch (error) {
      if (idempotencyKey && error && typeof error === "object" && "code" in error && error.code === 11000) { const replay = await findReplay(); if (replay) return replay }
      throw error
    }
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
      job: { id: ticket.jobId, status: ticket.jobStatus, attempts: ticket.jobAttempts },
      external_ticket_id: ticket.externalTicketId ?? null, external_customer_id: ticket.externalCustomerId ?? null, metadata: ticket.metadata ?? {},
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

    let settings = settingsFor()
    try {
      const organization = await OrganizationModel.findById(organizationId)
      if (!organization) {
         throw new NotFoundError("Organization not found")
      }

      if (resetMonthlyUsage(organization)) {
        await organization.save()
      }

      settings = settingsFor(organization)
      const startedAt = performance.now()
      let aiOutputResult: AnalyzedTicket
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
        }, settings)
        aiOutputResult = pipelineResult.result
        const usedFallback = Object.values(pipelineResult.trace).includes("fallback")
        provider = usedFallback ? "deterministic-fallback" : env.LLM_PROVIDER
        model = usedFallback ? "keyword-analyzer" : env.LLM_PROVIDER === "mock" ? "mock-stub" : env.LLM_MODEL
        
        organization.ticketsProcessedThisCycle += 1
        await organization.save()
      }
      
      if (!settings.categories.includes(aiOutputResult.category)) aiOutputResult.category = "Other"
      if (provider === "deterministic-fallback" && settings.template !== "college_it") {
        aiOutputResult = { category: "Other", priority: "Medium", summary: ticket.normalizedTitle, root_cause: "Not established; staff review required.", suggested_resolution: "Review the complaint and verify the external reference before taking action.", confidence: 0, auto_resolve: false }
      }
      // Load private bytes only while processing, never in ticket JSON responses.
      if (ticket.images?.length) {
        const withBytes = await SupportTicketModel.findOne({ _id: id, organizationId }).select("+images.data")
        for (const image of withBytes?.images ?? []) {
          const result = !settings.imageScreening ? { status: "disabled", score: null, detectorModel: "", checkedAt: new Date() } : image.data ? await analyzeImage(Buffer.from(image.data), image.mime) : { status: "unavailable", score: null, detectorModel: "", checkedAt: new Date() }
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
      }).catch(async (error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === 11000) {
          // A prior worker may have saved this version before crashing mid-commit.
          return AiResultModel.findOne({ ticketId: ticket._id, version: nextVersion }).orFail()
        }
        throw error
      })
      aiOutputResult = aiResult.result as AnalyzedTicket ?? aiOutputResult
      provider = aiResult.provider ?? provider

      // Only initialize a handoff once. Never overwrite work already claimed or resolved by a human.
      const decision = handoffDecision(aiOutputResult, provider, settings)
      if (ticket.images?.some(image => !["low_signal", "disabled"].includes(image.status))) {
        decision.workflowStatus = "needs_human"
        decision.handoffReason = "Image evidence needs support review. Screening is inconclusive, flagged, or unavailable; it is not a fraud verdict."
      }
      await SupportTicketModel.updateOne({
        _id: id, organizationId,
        $or: [{ workflowStatus: "awaiting_ai" }, { workflowStatus: { $exists: false } }, ...(ticket.images?.some(image => !["low_signal", "disabled"].includes(image.status)) ? [{ workflowStatus: "awaiting_confirmation" }] : [])]
      }, { $set: decision, $inc: { handoffRevision: 1 } })
      const completion: Record<string, unknown> = { latestAiResultId: aiResult._id, aiVersion: nextVersion, lastProcessedAt: new Date(), status: "processed" }
      for (const [index, image] of (ticket.images ?? []).entries()) {
        for (const field of ["status", "score", "detectorModel", "checkedAt"] as const) completion[`images.${index}.${field}`] = image[field]
      }
      // Persist evidence, completion and its notification in one atomic ticket write.
      await SupportTicketModel.updateOne({ _id: id, organizationId }, { $set: completion, $push: { pendingEvents: ticketEvent("analysis.completed", id, { ai_version: nextVersion }) } })
    } catch (error) {
      ticket.status = "failed"
      await ticket.save()
      await SupportTicketModel.updateOne({
        _id: id, organizationId,
        $or: [{ workflowStatus: "awaiting_ai" }, { workflowStatus: { $exists: false } }]
      }, { $set: { workflowStatus: "needs_human", assignedTeam: settings.teams[0], handoffReason: "Automatic processing failed; support staff review required." }, $inc: { handoffRevision: 1 } })
      throw error
    }
  }
}

export const ticketService = new TicketService()
