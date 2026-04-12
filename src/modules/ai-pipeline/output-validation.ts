import { z } from "zod"

import type { AnalyzedTicket, TicketCategory, TicketPriority } from "../../ticket-intelligence/types.js"

const outputSchema = z
  .object({
    category: z.enum(["Network", "Login", "Hardware", "Software", "Email", "Access", "Database", "Other"]),
    priority: z.enum(["Low", "Medium", "High", "Critical"]),
    summary: z.string().min(1).max(500),
    root_cause: z.string().min(1).max(1200),
    suggested_resolution: z.string().min(1).max(4000),
    confidence: z.number().min(0).max(1),
    auto_resolve: z.boolean()
  })
  .strict()

const CATEGORY_NORMALIZATION: Record<string, TicketCategory> = {
  network: "Network",
  login: "Login",
  hardware: "Hardware",
  software: "Software",
  email: "Email",
  access: "Access",
  database: "Database",
  other: "Other"
}

const PRIORITY_NORMALIZATION: Record<string, TicketPriority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
}

export type OutputValidationOptions = {
  minimumConfidence?: number
  autoCorrect?: boolean
}

export type OutputValidationResult = {
  valid: boolean
  corrected: boolean
  data?: AnalyzedTicket
  errors?: string[]
}

const sanitize = (value: string): string => value.trim().replace(/\s+/g, " ")

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const coerceConfidence = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(Math.min(1, Math.max(0, value)).toFixed(2))
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Number(Math.min(1, Math.max(0, parsed)).toFixed(2))
    }
  }

  return undefined
}

const autoCorrectOutput = (raw: unknown): { value: unknown; corrected: boolean } => {
  if (!isObject(raw)) {
    return { value: raw, corrected: false }
  }

  let corrected = false
  const draft: Record<string, unknown> = { ...raw }

  if (typeof draft["category"] === "string") {
    const normalized = CATEGORY_NORMALIZATION[draft["category"].toLowerCase().trim()]
    if (normalized && normalized !== draft["category"]) {
      draft["category"] = normalized
      corrected = true
    }
  }

  if (typeof draft["priority"] === "string") {
    const normalized = PRIORITY_NORMALIZATION[draft["priority"].toLowerCase().trim()]
    if (normalized && normalized !== draft["priority"]) {
      draft["priority"] = normalized
      corrected = true
    }
  }

  if (typeof draft["summary"] === "string") {
    const sanitized = sanitize(draft["summary"])
    if (sanitized !== draft["summary"]) {
      draft["summary"] = sanitized
      corrected = true
    }
  }

  if (typeof draft["root_cause"] === "string") {
    const sanitized = sanitize(draft["root_cause"])
    if (sanitized !== draft["root_cause"]) {
      draft["root_cause"] = sanitized
      corrected = true
    }
  }

  if (typeof draft["suggested_resolution"] === "string") {
    const sanitized = sanitize(draft["suggested_resolution"])
    if (sanitized !== draft["suggested_resolution"]) {
      draft["suggested_resolution"] = sanitized
      corrected = true
    }
  }

  const confidence = coerceConfidence(draft["confidence"])
  if (confidence !== undefined && confidence !== draft["confidence"]) {
    draft["confidence"] = confidence
    corrected = true
  }

  if (
    draft["auto_resolve"] === true &&
    (draft["priority"] === "High" || draft["priority"] === "Critical")
  ) {
    draft["auto_resolve"] = false
    corrected = true
  }

  return { value: draft, corrected }
}

export const validateAiOutput = (
  raw: unknown,
  options: OutputValidationOptions = {}
): OutputValidationResult => {
  const minimumConfidence = options.minimumConfidence ?? 0.75
  const autoCorrect = options.autoCorrect ?? true

  const candidate = autoCorrect ? autoCorrectOutput(raw) : { value: raw, corrected: false }
  const parsed = outputSchema.safeParse(candidate.value)

  if (!parsed.success) {
    return {
      valid: false,
      corrected: candidate.corrected,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    }
  }

  if (parsed.data.confidence < minimumConfidence) {
    return {
      valid: false,
      corrected: candidate.corrected,
      errors: [`confidence below threshold: ${parsed.data.confidence} < ${minimumConfidence}`]
    }
  }

  return {
    valid: true,
    corrected: candidate.corrected,
    data: parsed.data
  }
}

export const assertValidAiOutput = (
  raw: unknown,
  options?: OutputValidationOptions
): AnalyzedTicket => {
  const result = validateAiOutput(raw, options)

  if (!result.valid || !result.data) {
    const message = result.errors?.join("; ") ?? "AI output validation failed"
    throw new Error(message)
  }

  return result.data
}
