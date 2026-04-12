import type { AnalyzedTicket } from "../../ticket-intelligence/types.js"

export type PipelineStepStatus = "success" | "fallback"

export type PipelineTrace = {
  extraction: PipelineStepStatus
  classification: PipelineStepStatus
  resolution: PipelineStepStatus
}

export type AiPipelineResult = {
  result: AnalyzedTicket
  trace: PipelineTrace
}
