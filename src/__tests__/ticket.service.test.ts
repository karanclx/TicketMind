import { beforeEach, describe, expect, it, vi } from "vitest"

const PIPELINE_DELAY_MS = 40

const { createAiResult, findTicketById, processTicket, findOrgById } = vi.hoisted(() => ({
  createAiResult: vi.fn(),
  findTicketById: vi.fn(),
  processTicket: vi.fn(),
  findOrgById: vi.fn()
}))

vi.mock("../models/AiResult.js", () => ({
  AiResultModel: { create: createAiResult, findById: vi.fn() }
}))

vi.mock("../models/SupportTicket.js", () => ({
  SupportTicketModel: { findOne: findTicketById, findById: vi.fn(), create: vi.fn() }
}))

vi.mock("../models/Organization.js", () => ({
  OrganizationModel: { findById: findOrgById, create: vi.fn() }
}))

vi.mock("../modules/ai-pipeline/ai-pipeline.service.js", () => ({
  aiPipelineService: { processTicket }
}))

import { TicketService } from "../modules/tickets/ticket.service.js"

const makeTicketDoc = () => ({
  _id: "661111111111111111111111",
  rawInput: {
    title: "Cannot login",
    description: "Password rejected",
    userRole: "employee",
    timestamp: new Date("2026-04-07T10:00:00.000Z")
  },
  normalizedTitle: "Cannot login",
  normalizedDescription: "Password rejected",
  status: "pending",
  reprocessCount: 0,
  aiVersion: 0,
  save: vi.fn().mockResolvedValue(undefined)
})

const makeOrgDoc = () => ({
  _id: "org1",
  ticketsProcessedThisCycle: 0,
  monthlyTicketQuota: 50,
  save: vi.fn().mockResolvedValue(undefined)
})

describe("TicketService.processTicketById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("persists the measured pipeline duration as processingMs", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    findOrgById.mockResolvedValue(makeOrgDoc())
    createAiResult.mockResolvedValue({ _id: "aiResultId" })
    processTicket.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: { category: "Login" }, trace: {} }), PIPELINE_DELAY_MS)
        })
    )

    await new TicketService().processTicketById("661111111111111111111111", false, "org1")

    expect(createAiResult).toHaveBeenCalledTimes(1)
    const persisted = createAiResult.mock.calls[0]?.[0] as { processingMs: number }
    expect(Number.isInteger(persisted.processingMs)).toBe(true)
    // Allow a little timer slack below the nominal delay.
    expect(persisted.processingMs).toBeGreaterThanOrEqual(PIPELINE_DELAY_MS - 5)
  })

  it("skips AI pipeline and falls back to deterministic analyzer when subscription is past_due", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    
    // Simulate an organization that is past due
    const orgDoc = makeOrgDoc()
    orgDoc.ticketsProcessedThisCycle = 10
    orgDoc.monthlyTicketQuota = 50
    ;(orgDoc as any).subscriptionStatus = "past_due"
    
    findOrgById.mockResolvedValue(orgDoc)
    createAiResult.mockResolvedValue({ _id: "aiResultId" })
    
    // Mock the pipeline resolving immediately if it were called (should not be)
    processTicket.mockResolvedValue({ result: { category: "Login" }, trace: {} })

    await new TicketService().processTicketById("661111111111111111111111", false, "org1")

    // Assert the AI pipeline was NOT called
    expect(processTicket).not.toHaveBeenCalled()
    
    // Assert the deterministic analyzer result was saved
    expect(createAiResult).toHaveBeenCalledTimes(1)
    const persisted = createAiResult.mock.calls[0]?.[0] as { provider: string }
    expect(persisted.provider).toBe("deterministic-fallback")
  })
})
