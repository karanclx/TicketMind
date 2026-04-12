import { ZodError, type ZodSchema } from "zod"

import type { IncomingTicket } from "../../ticket-intelligence/types.js"
import { fallbackAnalyze } from "./fallback.js"
import { defaultLlmClient, promptFactory } from "./default-llm-client.js"
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

const MAX_RETRIES = 2
const CONFIDENCE_MIN = 0.75

export class AiPipelineService {
  constructor(private readonly llmClient: LlmClient = defaultLlmClient) {}

  public async processTicket(ticket: IncomingTicket): Promise<AiPipelineResult> {
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

    if (!extraction || extraction.confidence < CONFIDENCE_MIN) {
      extractionStatus = "fallback"
      const fallback = fallbackAnalyze(ticket)
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
            extraction.key_signals
          )
        ),
      classificationSchema,
      "Classification"
    )

    if (!classification || classification.confidence < CONFIDENCE_MIN) {
      classificationStatus = "fallback"
      const fallback = fallbackAnalyze(ticket)
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
            classification.priority
          )
        ),
      resolutionSchema,
      "Resolution"
    )

    if (!resolution || resolution.confidence < CONFIDENCE_MIN) {
      resolutionStatus = "fallback"
      const fallback = fallbackAnalyze(ticket)
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
          resolution.auto_resolve && classification.priority !== "Critical" && classification.priority !== "High"
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
