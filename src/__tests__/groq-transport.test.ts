import { afterEach, describe, expect, it, vi } from "vitest"
import { GroqTransport } from "../modules/ai-pipeline/groq-transport.js"
import { JsonLlmClient } from "../modules/ai-pipeline/llm-client.js"
import { AiPipelineService } from "../modules/ai-pipeline/ai-pipeline.service.js"

const ticket = { title: "Campus network down", description: "Internet unavailable for all departments", user_role: "admin" as const, timestamp: "2026-10-27T00:00:00Z" }
const client = () => new JsonLlmClient({ model: "test-model", transport: new GroqTransport("test-key"), maxRetries: 0 })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("Groq integration", () => {
  it("sends JSON mode requests and validates all three stages", async () => {
    const outputs = [
      { cleaned_title: ticket.title, cleaned_description: ticket.description, key_signals: ["outage"], impact_scope: "org", confidence: 0.9 },
      { category: "Network", priority: "Critical", summary: "Campus outage", rationale: "All departments affected", confidence: 0.9 },
      { root_cause: "Possible gateway outage", suggested_resolution: "Check gateway status", auto_resolve: true, confidence: 0.9 }
    ]
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(outputs.shift()) } }] })))
    vi.stubGlobal("fetch", fetchMock)
    const result = await new AiPipelineService(client()).processTicket(ticket)
    expect(result.result.category).toBe("Network")
    expect(result.result.auto_resolve).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/chat/completions")
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: "Bearer test-key" }))
    expect(JSON.parse(options.body as string)).toEqual(expect.objectContaining({ response_format: { type: "json_object" }, model: "test-model" }))
  })

  it.each([429, 401, 500])("falls back after HTTP %i without leaking provider bodies", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive provider error", { status })))
    const result = await new AiPipelineService(client()).processTicket(ticket)
    expect(result.trace.extraction).toBe("fallback")
    expect(result.result.category).toBe("Network")
  })

  it("aborts requests when the timeout expires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })
    })))
    await expect(client().completeJson([{ role: "user", content: "JSON please" }], { timeoutMs: 10 })).rejects.toThrow("Aborted")
  })
})
