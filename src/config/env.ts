import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/ticketmind"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  SERVICE_NAME: z.string().min(1).default("ticketmind-api"),
  SERVICE_VERSION: z.string().min(1).default("0.1.0"),
  LLM_PROVIDER: z.string().min(1).default("mock"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().optional().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2)
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`)
}

export const env = parsed.data