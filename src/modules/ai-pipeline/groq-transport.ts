import { z } from "zod"
import type { LlmCompletionRequest, LlmCompletionResponse, LlmTransport } from "./llm-client.js"

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1)
})

export class GroqTransport implements LlmTransport {
  constructor(private readonly apiKey: string) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      signal: request.signal ?? null,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        response_format: { type: "json_object" },
        max_completion_tokens: 2048
      })
    })
    // Never include provider response bodies or credentials in logs/errors.
    if (!response.ok) throw new Error(`Groq request failed (HTTP ${response.status})`)
    const parsed = responseSchema.parse(await response.json())
    return { content: parsed.choices[0]!.message.content }
  }
}
