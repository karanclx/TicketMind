import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/ticketmind"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  SERVICE_NAME: z.string().min(1).default("ticketmind-api"),
  SERVICE_VERSION: z.string().min(1).default("0.1.0"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  SIGHTENGINE_API_USER: z.string().trim().default(""),
  SIGHTENGINE_API_SECRET: z.string().trim().default(""),
  SIGHTENGINE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LLM_PROVIDER: z.enum(["mock", "groq"]).default("mock"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().optional().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  STRIPE_PRICE_ID_STARTER: z.string().min(1, "STRIPE_PRICE_ID_STARTER is required"),
  STRIPE_PRICE_ID_GROWTH: z.string().min(1, "STRIPE_PRICE_ID_GROWTH is required")
})

const parsed = envSchema.superRefine((config, ctx) => {
  if (config.LLM_PROVIDER === "groq" && (!config.LLM_API_KEY.trim() || !config.LLM_MODEL.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Groq requires LLM_API_KEY and LLM_MODEL", path: ["LLM_PROVIDER"] })
  }
}).safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`)
}

export const env = parsed.data