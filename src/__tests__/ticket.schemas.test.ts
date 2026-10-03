import { describe, expect, it } from "vitest"

import { ValidationError } from "../lib/errors.js"
import { validatePayload } from "../lib/validate.js"
import { ticketIdParamSchema } from "../modules/tickets/ticket.schemas.js"

describe("ticketIdParamSchema", () => {
  it("accepts a valid 24-char hex ObjectId", () => {
    expect(validatePayload(ticketIdParamSchema, { id: "661111111111111111111111" })).toEqual({
      id: "661111111111111111111111"
    })
  })

  it("rejects a 24-char non-hex id with a 400 ValidationError (not a downstream CastError)", () => {
    const attempt = () => validatePayload(ticketIdParamSchema, { id: "z".repeat(24) })
    expect(attempt).toThrowError(ValidationError)
    try {
      attempt()
    } catch (error) {
      expect((error as ValidationError).statusCode).toBe(400)
    }
  })
})
