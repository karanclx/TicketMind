import { type ZodSchema } from "zod"

import { ValidationError } from "./errors.js"

export const validatePayload = <T>(schema: ZodSchema<T>, input: unknown): T => {
  const result = schema.safeParse(input)

  if (!result.success) {
    throw new ValidationError("Invalid request payload", result.error.flatten())
  }

  return result.data
}
