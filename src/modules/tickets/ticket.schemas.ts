import { z } from "zod"

export const createTicketSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  user_role: z.enum(["student", "employee", "admin"]),
  timestamp: z.string().datetime()
})

export const ticketIdParamSchema = z.object({
  id: z.string().length(24)
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>
