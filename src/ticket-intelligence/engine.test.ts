import { describe, expect, it } from "vitest"

import { analyzeTicketInput } from "./engine.js"

describe("analyzeTicketInput", () => {
  it("classifies login password reset as medium and auto-resolvable", () => {
    const result = analyzeTicketInput({
      title: "Cannot log in to portal",
      description:
        "I forgot password and need a password reset. Login keeps failing since morning.",
      user_role: "employee",
      timestamp: "2026-04-07T10:30:00.000Z"
    })

    expect(result.category).toBe("Login")
    expect(result.priority).toBe("Medium")
    expect(result.auto_resolve).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("classifies broad outage as critical", () => {
    const result = analyzeTicketInput({
      title: "VPN outage across team",
      description: "VPN is down for all users and everyone is blocked from production access.",
      user_role: "admin",
      timestamp: "2026-04-07T11:00:00.000Z"
    })

    expect(result.category).toBe("Network")
    expect(result.priority).toBe("Critical")
    expect(result.auto_resolve).toBe(false)
  })

  it("falls back to other with lower confidence when unclear", () => {
    const result = analyzeTicketInput({
      title: "Need help",
      description: "Something seems off but I cannot explain it clearly.",
      user_role: "student",
      timestamp: "2026-04-07T12:00:00.000Z"
    })

    expect(result.category).toBe("Other")
    expect(result.confidence).toBeLessThanOrEqual(0.55)
    expect(result.auto_resolve).toBe(false)
  })

  it("throws for invalid input", () => {
    expect(() =>
      analyzeTicketInput({
        title: "x",
        description: "y",
        user_role: "guest",
        timestamp: "invalid"
      })
    ).toThrowError()
  })
})
