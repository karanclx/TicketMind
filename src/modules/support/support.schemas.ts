import { z } from "zod"
import { SUPPORT_TEAMS, WORKFLOW_STATES } from "./support-policy.js"
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID")
export const queueQuerySchema = z.object({
  status: z.enum(WORKFLOW_STATES).optional(),
  team: z.enum(SUPPORT_TEAMS).optional(),
  page: z.coerce.number().int().min(1).default(1)
})
export const handoffSchema = z.object({
  action: z.enum(["request_human", "confirm_fixed", "assign", "start", "resolve", "reopen"]),
  expected_revision: z.number().int().min(0),
  team: z.enum(SUPPORT_TEAMS).optional(),
  assignee_id: objectId.nullable().optional(),
  note: z.string().trim().max(4000).optional()
}).strict()
export type HandoffInput = z.infer<typeof handoffSchema>
export const addAgentSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(12).max(128)
}).strict()
