import { z } from "zod"

export const checkoutSessionSchema = z.object({
  plan: z.enum(["starter", "growth"])
})

export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>
