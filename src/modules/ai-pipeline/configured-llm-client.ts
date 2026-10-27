import { env } from "../../config/env.js"
import { defaultLlmClient } from "./default-llm-client.js"
import { GroqTransport } from "./groq-transport.js"
import { JsonLlmClient } from "./llm-client.js"

export const configuredLlmClient = env.LLM_PROVIDER === "groq"
  ? new JsonLlmClient({
      model: env.LLM_MODEL,
      transport: new GroqTransport(env.LLM_API_KEY),
      defaultTemperature: env.LLM_TEMPERATURE,
      defaultTimeoutMs: env.LLM_TIMEOUT_MS,
      // The pipeline owns retries, including invalid schema responses.
      maxRetries: 0
    })
  : defaultLlmClient
