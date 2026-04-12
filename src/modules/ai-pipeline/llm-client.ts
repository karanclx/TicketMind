import { logger } from "../../config/logger.js"

export type LlmMessage = {
  role: "system" | "user"
  content: string
}

export type LlmCompletionRequest = {
  model: string
  messages: LlmMessage[]
  temperature: number
  signal?: AbortSignal
}

export type LlmCompletionResponse = {
  content: string
  raw?: unknown
}

export interface LlmTransport {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>
}

export type CompleteJsonOptions = {
  temperature?: number
  timeoutMs?: number
  retries?: number
  requestId?: string
}

export interface LlmClient {
  completeJson(messages: LlmMessage[], options?: CompleteJsonOptions): Promise<unknown>
}

export type JsonLlmClientConfig = {
  model: string
  transport: LlmTransport
  defaultTemperature?: number
  defaultTimeoutMs?: number
  maxRetries?: number
}

const JSON_ONLY_INSTRUCTION =
  "Return only valid JSON. Do not include markdown fences, commentary, or extra text."

const withJsonInstruction = (messages: LlmMessage[]): LlmMessage[] => {
  const existingSystem = messages.find((message) => message.role === "system")

  if (!existingSystem) {
    return [{ role: "system", content: JSON_ONLY_INSTRUCTION }, ...messages]
  }

  return messages.map((message) => {
    if (message.role !== "system") {
      return message
    }

    return {
      role: "system",
      content: `${message.content}\n\n${JSON_ONLY_INSTRUCTION}`
    }
  })
}

const safeJsonParse = (input: string): unknown => {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("LLM response was empty")
  }

  return JSON.parse(trimmed)
}

export class JsonLlmClient implements LlmClient {
  private readonly model: string
  private readonly transport: LlmTransport
  private readonly defaultTemperature: number
  private readonly defaultTimeoutMs: number
  private readonly maxRetries: number

  constructor(config: JsonLlmClientConfig) {
    this.model = config.model
    this.transport = config.transport
    this.defaultTemperature = config.defaultTemperature ?? 0.2
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10000
    this.maxRetries = config.maxRetries ?? 2
  }

  public async completeJson(messages: LlmMessage[], options?: CompleteJsonOptions): Promise<unknown> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs
    const retries = options?.retries ?? this.maxRetries
    const temperature = options?.temperature ?? this.defaultTemperature
    const requestId = options?.requestId ?? "n/a"
    const prompt = withJsonInstruction(messages)

    let attempt = 0

    while (attempt <= retries) {
      attempt += 1
      const startedAt = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort()
      }, timeoutMs)

      try {
        logger.info(
          {
            requestId,
            model: this.model,
            attempt,
            temperature,
            timeoutMs,
            messageCount: prompt.length
          },
          "LLM request started"
        )

        const response = await this.transport.complete({
          model: this.model,
          messages: prompt,
          temperature,
          signal: controller.signal
        })

        const parsed = safeJsonParse(response.content)
        logger.info(
          {
            requestId,
            model: this.model,
            attempt,
            latencyMs: Date.now() - startedAt,
            responseLength: response.content.length
          },
          "LLM request succeeded"
        )

        return parsed
      } catch (error) {
        const isLastAttempt = attempt > retries
        logger.warn(
          {
            requestId,
            model: this.model,
            attempt,
            latencyMs: Date.now() - startedAt,
            isLastAttempt,
            error
          },
          "LLM request failed"
        )

        if (isLastAttempt) {
          throw error
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    throw new Error("LLM request failed after retries")
  }
}
