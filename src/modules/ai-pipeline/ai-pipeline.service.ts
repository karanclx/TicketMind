import { settingsFor, type WorkspaceSettings } from "../workspace/workspace.settings.js"
import { ZodError, type ZodSchema } from "zod"

import type { IncomingTicket } from "../../ticket-intelligence/types.js"
import { fallbackAnalyze } from "./fallback.js"
import { env } from "../../config/env.js"
import { configuredLlmClient } from "./configured-llm-client.js"
import { promptFactory } from "./default-llm-client.js"
import type { LlmClient } from "./llm-client.js"
import {
  classificationSchema,
  extractionSchema,
  resolutionSchema,
  type ClassificationOutput,
  type ExtractionOutput,
  type ResolutionOutput
} from "./schemas.js"
import type { AiPipelineResult, PipelineStepStatus } from "./types.js"

const MAX_RETRIES = env.LLM_MAX_RETRIES

export class AiPipelineService {
  constructor(private readonly llmClient: LlmClient = configuredLlmClient) {}

  public async processTicket(ticket: IncomingTicket, settings: WorkspaceSettings = settingsFor()): Promise<AiPipelineResult> {
    let extractionStatus: PipelineStepStatus = "success"
    let classificationStatus: PipelineStepStatus = "success"
    let resolutionStatus: PipelineStepStatus = "success"

    let extraction: ExtractionOutput | null = null
    let classification: ClassificationOutput | null = null
    let resolution: ResolutionOutput | null = null

    extraction = await this.runStepWithRetry(
      () => this.llmClient.completeJson(promptFactory.extraction(ticket.title, ticket.description, ticket.user_role)),
      extractionSchema,
      "Extraction"
    )

    if (!extraction || extraction.confidence < settings.escalation.minConfidence) {
      extractionStatus = "fallback"
      const fallback = (settings.template !== "college_it" ? { category: "Other", priority: "Medium" as const, summary: ticket.title, root_cause: "Not established; staff review required.", suggested_resolution: "Review the complaint and verify the external reference before taking action.", confidence: 0, auto_resolve: false } : fallbackAnalyze(ticket))
      return {
        result: fallback,
        trace: {
          extraction: extractionStatus,
          classification: "fallback",
          resolution: "fallback"
        }
      }
    }

    classification = await this.runStepWithRetry(
      () =>
        this.llmClient.completeJson(
          promptFactory.classification(
            extraction.cleaned_title,
            extraction.cleaned_description,
            extraction.key_signals, settings.categories
          )
        ),
      classificationSchema.extend({ category: classificationSchema.shape.category.refine(value => settings.categories.includes(value)) }),
      "Classification"
    )

    if (!classification || classification.confidence < settings.escalation.minConfidence) {
      classificationStatus = "fallback"
      const fallback = (settings.template !== "college_it" ? { category: "Other", priority: "Medium" as const, summary: ticket.title, root_cause: "Not established; staff review required.", suggested_resolution: "Review the complaint and verify the external reference before taking action.", confidence: 0, auto_resolve: false } : fallbackAnalyze(ticket))
      return {
        result: fallback,
        trace: {
          extraction: extractionStatus,
          classification: classificationStatus,
          resolution: "fallback"
        }
      }
    }

    resolution = await this.runStepWithRetry(
      () =>
        this.llmClient.completeJson(
          promptFactory.resolution(
            extraction.cleaned_description,
            classification.category,
            classification.priority, settings.instructions
          )
        ),
      resolutionSchema,
      "Resolution"
    )

    if (!resolution || resolution.confidence < settings.escalation.minConfidence) {
      resolutionStatus = "fallback"
      const fallback = (settings.template !== "college_it" ? { category: "Other", priority: "Medium" as const, summary: ticket.title, root_cause: "Not established; staff review required.", suggested_resolution: "Review the complaint and verify the external reference before taking action.", confidence: 0, auto_resolve: false } : fallbackAnalyze(ticket))
      return {
        result: fallback,
        trace: {
          extraction: extractionStatus,
          classification: classificationStatus,
          resolution: resolutionStatus
        }
      }
    }

    return {
      result: {
        category: classification.category,
        priority: classification.priority,
        summary: classification.summary,
        root_cause: resolution.root_cause,
        suggested_resolution: resolution.suggested_resolution,
        confidence: Number(
          ((extraction.confidence + classification.confidence + resolution.confidence) / 3).toFixed(2)
        ),
        auto_resolve:
          resolution.auto_resolve && !settings.escalation.priorities.includes(classification.priority)
      },
      trace: {
        extraction: extractionStatus,
        classification: classificationStatus,
        resolution: resolutionStatus
      }
    }
  }

  private async runStepWithRetry<T>(
    producer: () => Promise<unknown>,
    schema: ZodSchema<T>,
    stepName: string
  ): Promise<T | null> {
    let attempt = 0
    while (attempt <= MAX_RETRIES) {
      try {
        const raw = await producer()
        return this.validateStep(raw, schema)
      } catch (error) {
        attempt += 1

        if (attempt > MAX_RETRIES) {
          return null
        }

        await this.backoff(attempt, stepName, error)
      }
    }

    return null
  }

  private validateStep<T>(input: unknown, schema: ZodSchema<T>): T {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      throw new ZodError(parsed.error.issues)
    }

    return parsed.data
  }

  private async backoff(attempt: number, _stepName: string, _error: unknown): Promise<void> {
    const delay = 100 * 2 ** (attempt - 1)
    await new Promise((resolve) => {
      setTimeout(resolve, delay)
    })
  }
}

export const aiPipelineService = new AiPipelineService()
