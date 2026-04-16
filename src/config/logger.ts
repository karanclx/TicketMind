import { env } from "./env.js"

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal"

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50
}

const shouldLog = (level: LogLevel): boolean => {
  return levelRank[level] >= levelRank[env.LOG_LEVEL]
}

const write = (level: LogLevel, context: unknown, message: string): void => {
  if (!shouldLog(level)) {
    return
  }

  const payload = context === undefined ? {} : context
  const line = JSON.stringify({ level, message, ...((payload as Record<string, unknown>) ?? {}) })

  if (level === "error" || level === "fatal") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.log(line)
}

export const logger = {
  debug(context: unknown, message: string): void {
    write("debug", context, message)
  },
  info(context: unknown, message: string): void {
    write("info", context, message)
  },
  warn(context: unknown, message: string): void {
    write("warn", context, message)
  },
  error(context: unknown, message: string): void {
    write("error", context, message)
  },
  fatal(context: unknown, message: string): void {
    write("fatal", context, message)
  }
}