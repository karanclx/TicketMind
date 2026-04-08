import { analyzeTicket } from "./analyzer.js"
import type { AnalyzedTicket, IncomingTicket, TicketUserRole } from "./types.js"

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isUserRole = (value: string): value is TicketUserRole =>
  value === "student" || value === "employee" || value === "admin"

const asNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid or missing '${field}'`)
  }

  return value.trim()
}

const assertIsoTimestamp = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid 'timestamp' format")
  }

  return value
}

export const parseIncomingTicket = (input: unknown): IncomingTicket => {
  if (!isObject(input)) {
    throw new Error("Input must be a JSON object")
  }

  const title = asNonEmptyString(input["title"], "title")
  const description = asNonEmptyString(input["description"], "description")
  const userRoleValue = asNonEmptyString(input["user_role"], "user_role")

  if (!isUserRole(userRoleValue)) {
    throw new Error("'user_role' must be one of: student, employee, admin")
  }

  const timestamp = assertIsoTimestamp(asNonEmptyString(input["timestamp"], "timestamp"))

  return {
    title,
    description,
    user_role: userRoleValue,
    timestamp
  }
}

export const analyzeTicketInput = (input: unknown): AnalyzedTicket => {
  const ticket = parseIncomingTicket(input)
  return analyzeTicket(ticket)
}
