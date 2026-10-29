import type { WorkspaceSettings } from "../workspace/workspace.settings.js"
export const SUPPORT_ROLES = ["owner", "admin", "agent"]
export const SUPPORT_TEAMS = ["IT Helpdesk", "Network Support", "Account Support", "Hardware Support", "Application Support", "Database Support"] as const
export const WORKFLOW_STATES = ["awaiting_ai", "awaiting_confirmation", "needs_human", "in_progress", "resolved"] as const

export function teamForCategory(category?: string): typeof SUPPORT_TEAMS[number] {
  switch (category) {
    case "Network": return "Network Support"
    case "Login": case "Access": case "Email": return "Account Support"
    case "Hardware": return "Hardware Support"
    case "Software": return "Application Support"
    case "Database": return "Database Support"
    default: return "IT Helpdesk"
  }
}

export function handoffDecision(result: { category: string; priority: string; auto_resolve: boolean; confidence: number }, provider: string, settings?: WorkspaceSettings) {
  const needsHuman = settings?.escalation.alwaysHuman || provider === "mock" || provider === "deterministic-fallback" || !result.auto_resolve || result.confidence < (settings?.escalation.minConfidence ?? 0.75) || (settings?.escalation.priorities ?? ["Critical", "High"]).includes(result.priority as "High" | "Critical")
  return {
    workflowStatus: needsHuman ? "needs_human" : "awaiting_confirmation",
    assignedTeam: settings ? settings.routes.find(route => route.category === result.category)?.team ?? settings.teams[0]! : teamForCategory(result.category),
    handoffReason: needsHuman ? (provider === "mock" || provider === "deterministic-fallback" ? "AI unavailable; human review required." : "Analysis requires support staff review.") : "Waiting for the requester to confirm whether the suggestion worked.",
    triageCategory: result.category,
    triagePriority: result.priority
  }
}
