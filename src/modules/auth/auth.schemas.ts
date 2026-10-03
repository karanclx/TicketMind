import { z } from "zod"

export const signupSchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z.string().min(8, "Password must be at least 8 characters long")
})

export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z.string().min(1, "Password is required")
})

export type LoginInput = z.infer<typeof loginSchema>
