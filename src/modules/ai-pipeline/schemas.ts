import { z } from "zod"

export const extractionSchema = z.object({
  cleaned_title: z.string().min(1).max(300),
  cleaned_description: z.string().min(1).max(10000),
  key_signals: z.array(z.string().min(1).max(120)).max(20),
  impact_scope: z.enum(["single_user", "team", "org", "unknown"]),
  confidence: z.number().min(0).max(1)
})

export const classificationSchema = z.object({
  category: z.enum(["Network", "Login", "Hardware", "Software", "Email", "Access", "Database", "Other"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  summary: z.string().min(1).max(500),
  rationale: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1)
})

export const resolutionSchema = z.object({
  root_cause: z.string().min(1).max(1200),
  suggested_resolution: z.string().min(1).max(4000),
  auto_resolve: z.boolean(),
  confidence: z.number().min(0).max(1)
})

export type ExtractionOutput = z.infer<typeof extractionSchema>
export type ClassificationOutput = z.infer<typeof classificationSchema>
export type ResolutionOutput = z.infer<typeof resolutionSchema>
