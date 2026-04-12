import type { AnalyzedTicket, IncomingTicket } from "../../ticket-intelligence/types.js"
import { analyzeTicket } from "../../ticket-intelligence/analyzer.js"

export const fallbackAnalyze = (ticket: IncomingTicket): AnalyzedTicket => {
  return analyzeTicket(ticket)
}
