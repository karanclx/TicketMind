import { describe, expect, it, vi } from "vitest"
import { settingsFor, WORKSPACE_TEMPLATES, workspaceSettingsSchema } from "../modules/workspace/workspace.settings.js"
import { handoffDecision } from "../modules/support/support-policy.js"
import { AiPipelineService } from "../modules/ai-pipeline/ai-pipeline.service.js"
import { encryptSecret, decryptSecret, webhookSignature, isPublicIPv4, parseWebhookUrl } from "../modules/integrations/webhook.transport.js"
import { createHmac } from "node:crypto"

describe("workspace templates", () => {
  it("defaults old organizations to College IT and validates every template", () => {
    expect(settingsFor({}).template).toBe("college_it")
    Object.values(WORKSPACE_TEMPLATES).forEach(value => expect(workspaceSettingsSchema.safeParse(value).success).toBe(true))
  })
  it("rejects missing fallback, duplicate labels and invalid routing", () => {
    const base = WORKSPACE_TEMPLATES["food_delivery"]!
    expect(workspaceSettingsSchema.safeParse({ ...base, categories: ["Missing item"] }).success).toBe(false)
    expect(workspaceSettingsSchema.safeParse({ ...base, teams: ["A", "A"] }).success).toBe(false)
    expect(workspaceSettingsSchema.safeParse({ ...base, routes: [{ category: "Missing item", team: "Network Support" }] }).success).toBe(false)
  })
  it("routes a delivery complaint using workspace policy and always-human rules", () => {
    const result = handoffDecision({ category: "Delivery delay", priority: "Low", confidence: .99, auto_resolve: true }, "groq", WORKSPACE_TEMPLATES["food_delivery"]!)
    expect(result.assignedTeam).toBe("Delivery Support")
    expect(result.workflowStatus).toBe("needs_human")
  })
  it("passes configured categories and instructions to AI and rejects other categories", async () => {
    const completeJson = vi.fn().mockResolvedValueOnce({ cleaned_title: "Late", cleaned_description: "Food late", key_signals: [], impact_scope: "single_user", confidence: .99 }).mockResolvedValueOnce({ category: "Delivery delay", priority: "Medium", summary: "Late order", rationale: "Reported delay", confidence: .99 }).mockResolvedValueOnce({ root_cause: "Unknown", suggested_resolution: "Check delivery records", auto_resolve: false, confidence: .99 })
    const result = await new AiPipelineService({ completeJson }).processTicket({ title: "Late", description: "Food late", user_role: "customer", timestamp: new Date().toISOString() }, WORKSPACE_TEMPLATES["food_delivery"]!)
    expect(result.result.category).toBe("Delivery delay")
    expect(JSON.stringify(completeJson.mock.calls[1])).toContain("Missing item")
    expect(JSON.stringify(completeJson.mock.calls[2])).toContain("Never promise or execute a refund")
    completeJson.mockReset().mockResolvedValue({ cleaned_title: "Late", cleaned_description: "Food late", key_signals: [], impact_scope: "single_user", confidence: .99, category: "Network", priority: "Medium", summary: "Late", rationale: "Bad", root_cause: "Unknown", suggested_resolution: "Check", auto_resolve: false })
    const fallback = await new AiPipelineService({ completeJson }).processTicket({ title: "Late", description: "Food late", user_role: "customer", timestamp: new Date().toISOString() }, WORKSPACE_TEMPLATES["food_delivery"]!)
    expect(fallback.result.category).toBe("Other")
    expect(fallback.result.auto_resolve).toBe(false)
    expect(fallback.trace.classification).toBe("fallback")
  })
})
describe("webhook security", () => {
  it("encrypts credentials and detects tampering", () => {
    const encrypted = encryptSecret("private-key")
    expect(encrypted).not.toContain("private-key")
    expect(decryptSecret(encrypted)).toBe("private-key")
    const parts = encrypted.split("."); parts[2] = Buffer.from("tampered").toString("base64")
    expect(() => decryptSecret(parts.join("."))).toThrow()
  })
  it("signs the exact timestamp and body", () => {
    expect(webhookSignature("secret", "123", '{"a":1}')).toBe(createHmac("sha256", "secret").update('123.{"a":1}').digest("hex"))
    expect(webhookSignature("secret", "124", '{"a":1}')).not.toBe(webhookSignature("secret", "123", '{"a":1}'))
  })
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "198.18.0.1", "203.0.113.1", "224.0.0.1"])("blocks nonpublic destination %s", ip => expect(isPublicIPv4(ip)).toBe(false))
  it("accepts public IPv4 and rejects unsafe URL forms", () => {
    expect(isPublicIPv4("8.8.8.8")).toBe(true)
    for (const url of ["http://example.com", "https://localhost/events", "https://user:pass@example.com", "https://example.com:444", "https://example.com/?key=secret", "https://127.0.0.1"]) expect(() => parseWebhookUrl(url)).toThrow()
    expect(parseWebhookUrl("https://receiver.example.com/events").pathname).toBe("/events")
  })
})
