import { describe, expect, it } from "vitest"
import { resetMonthlyUsage } from "../modules/tickets/usage-cycle.js"

describe("monthly usage renewal", () => {
  it("resets expired quotas once, including across a year boundary", () => {
    const org = { ticketsProcessedThisCycle: 50, cycleResetAt: new Date("2026-12-01Z") }
    const now = new Date("2027-01-15Z")
    expect(resetMonthlyUsage(org, now)).toBe(true)
    expect(org.ticketsProcessedThisCycle).toBe(0)
    expect(org.cycleResetAt.toISOString()).toBe("2027-02-01T00:00:00.000Z")
    org.ticketsProcessedThisCycle = 1
    expect(resetMonthlyUsage(org, now)).toBe(false)
    expect(org.ticketsProcessedThisCycle).toBe(1)
  })

  it("migrates an old organization without a reset date", () => {
    const org = { ticketsProcessedThisCycle: 50, createdAt: new Date("2025-01-15Z") }
    expect(resetMonthlyUsage(org, new Date("2026-10-27Z"))).toBe(true)
    expect(org.ticketsProcessedThisCycle).toBe(0)
  })

  it("preserves current-month usage when initializing a missing reset date", () => {
    const org = { ticketsProcessedThisCycle: 10, createdAt: new Date("2026-10-01Z") }
    resetMonthlyUsage(org, new Date("2026-10-27Z"))
    expect(org.ticketsProcessedThisCycle).toBe(10)
  })
})
