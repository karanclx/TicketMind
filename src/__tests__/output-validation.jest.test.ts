import { describe, expect, it } from "@jest/globals"

import { assertValidAiOutput, validateAiOutput } from "../modules/ai-pipeline/output-validation.js"

describe("AI output validation", () => {
  it("auto-corrects safe fields and validates output", () => {
    const result = validateAiOutput({
      category: "login",
      priority: "high",
      summary: "  Cannot login  ",
      root_cause: "  Credentials invalid  ",
      suggested_resolution: " 1) Reset password. 2) Retry. ",
      confidence: "0.91",
      auto_resolve: true
    })

    expect(result.valid).toBe(true)
    expect(result.corrected).toBe(true)
    expect(result.data?.category).toBe("Login")
    expect(result.data?.priority).toBe("High")
    expect(result.data?.auto_resolve).toBe(false)
  })

  it("rejects enum violations", () => {
    const result = validateAiOutput({
      category: "Auth",
      priority: "P1",
      summary: "Cannot login",
      root_cause: "Unknown",
      suggested_resolution: "Investigate",
      confidence: 0.9,
      auto_resolve: false
    })

    expect(result.valid).toBe(false)
    expect(result.errors?.length).toBeGreaterThan(0)
  })

  it("rejects below confidence threshold", () => {
    const result = validateAiOutput(
      {
        category: "Login",
        priority: "Medium",
        summary: "Cannot login",
        root_cause: "Unknown",
        suggested_resolution: "Reset password",
        confidence: 0.4,
        auto_resolve: false
      },
      { minimumConfidence: 0.75 }
    )

    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toContain("confidence below threshold")
  })

  it("throws from assertValidAiOutput for invalid input", () => {
    expect(() => assertValidAiOutput({})).toThrowError()
  })
})
