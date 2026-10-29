import { imageInputSchema } from "../evidence/evidence.service.js"
import { z } from "zod"

export const createTicketSchema = z.object({
  external_ticket_id: z.string().trim().min(1).max(200).optional(),
  external_customer_id: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()])).refine(value => Object.keys(value).length <= 30, "At most 30 metadata fields").optional(),
  images: z.array(imageInputSchema).max(2).optional(),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  user_role: z.enum(["student", "employee", "admin", "customer"]).default("customer"),
  timestamp: z.string().datetime()
})

export const ticketIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a 24-character hex ObjectId")
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>
