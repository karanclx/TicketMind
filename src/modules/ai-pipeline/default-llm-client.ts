import type { LlmClient, LlmMessage } from "./llm-client.js"

import {
  buildClassificationUserPrompt,
  buildExtractionUserPrompt,
  buildResolutionUserPrompt,
  CLASSIFICATION_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  RESOLUTION_SYSTEM_PROMPT
} from "./prompts.js"

type InferenceContext = {
  title: string
  description: string
  userRole: string
}

const parseContext = (messages: LlmMessage[]): InferenceContext => {
  const user = messages.find((m) => m.role === "user")?.content ?? ""
  const titleMatch = user.match(/title:\s*(.*)/)
  const descriptionMatch = user.match(/description:\s*(.*)/)
  const roleMatch = user.match(/user_role:\s*(.*)/)

  return {
    title: titleMatch?.[1]?.trim() ?? "",
    description: descriptionMatch?.[1]?.trim() ?? user.trim(),
    userRole: roleMatch?.[1]?.trim() ?? "employee"
  }
}

export class DefaultLlmClient implements LlmClient {
  public async completeJson(messages: LlmMessage[]): Promise<unknown> {
    const system = messages.find((m) => m.role === "system")?.content ?? ""
    const context = parseContext(messages)

    if (system === EXTRACTION_SYSTEM_PROMPT) {
      return {
        cleaned_title: context.title || "Support ticket",
        cleaned_description: context.description,
        key_signals: ["user_reported_issue"],
        impact_scope: "single_user",
        confidence: 0.88
      }
    }

    if (system === CLASSIFICATION_SYSTEM_PROMPT) {
      const lowered = `${context.title} ${context.description}`.toLowerCase()
      const category = lowered.includes("password") || lowered.includes("login") ? "Login" : "Other"

      return {
        category,
        priority: "Medium",
        summary: `${context.title || "Support issue"} (${category} issue).`,
        rationale: "Deterministic fallback classification based on ticket keywords.",
        confidence: 0.86
      }
    }

    if (system === RESOLUTION_SYSTEM_PROMPT) {
      return {
        root_cause: "Likely user-facing issue inferred from reported symptoms.",
        suggested_resolution:
          "1) Validate current user context and error details. 2) Apply standard remediation for the inferred category. 3) Re-test and escalate if issue persists.",
        auto_resolve: false,
        confidence: 0.84
      }
    }

    return {
      cleaned_title: "Support ticket",
      cleaned_description: context.description,
      key_signals: ["unknown"],
      impact_scope: "unknown",
      confidence: 0.5
    }
  }
}

export const defaultLlmClient = new DefaultLlmClient()

export const promptFactory = {
  extraction: (title: string, description: string, userRole: string): LlmMessage[] => [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: buildExtractionUserPrompt(title, description, userRole) }
  ],
  classification: (cleanedTitle: string, cleanedDescription: string, keySignals: string[]): LlmMessage[] => [
    { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildClassificationUserPrompt(cleanedTitle, cleanedDescription, keySignals)
    }
  ],
  resolution: (cleanedDescription: string, category: string, priority: string): LlmMessage[] => [
    { role: "system", content: RESOLUTION_SYSTEM_PROMPT },
    { role: "user", content: buildResolutionUserPrompt(cleanedDescription, category, priority) }
  ]
}
