import { beforeEach, describe, expect, it, vi } from "vitest"

const PIPELINE_DELAY_MS = 40

const { createAiResult, findTicketById, processTicket, findOrgById, updateWorkflow } = vi.hoisted(() => ({
  createAiResult: vi.fn(),
  findTicketById: vi.fn(),
  processTicket: vi.fn(),
  findOrgById: vi.fn(),
  updateWorkflow: vi.fn().mockResolvedValue({ modifiedCount: 1 })
}))

vi.mock("../models/AiResult.js", () => ({
  AiResultModel: { create: createAiResult, findById: vi.fn() }
}))

vi.mock("../models/SupportTicket.js", () => ({
  SupportTicketModel: { updateOne: updateWorkflow, findOne: findTicketById, findById: vi.fn(), create: vi.fn() }
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
  subscriptionStatus: "active",
  cycleResetAt: new Date("2099-01-01T00:00:00Z"),
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
    orgDoc.subscriptionStatus = "past_due"
    
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
  it("renews an exhausted quota before deciding whether to call the model", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    const org = makeOrgDoc()
    org.ticketsProcessedThisCycle = 50
    org.cycleResetAt = new Date("2020-01-01T00:00:00Z")
    findOrgById.mockResolvedValue(org)
    createAiResult.mockResolvedValue({ _id: "aiResultId" })
    processTicket.mockResolvedValue({ result: { category: "Network" }, trace: { extraction: "success" } })
    await new TicketService().processTicketById("661111111111111111111111", false, "org1")
    expect(processTicket).toHaveBeenCalledTimes(1)
    expect(org.ticketsProcessedThisCycle).toBe(1)
    expect(org.cycleResetAt.getTime()).toBeGreaterThan(Date.now())
  })

  it("labels a pipeline fallback accurately in the saved result", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    findOrgById.mockResolvedValue(makeOrgDoc())
    createAiResult.mockResolvedValue({ _id: "aiResultId" })
    processTicket.mockResolvedValue({ result: { category: "Network" }, trace: { extraction: "fallback" } })
    await new TicketService().processTicketById("661111111111111111111111", false, "org1")
    expect(createAiResult).toHaveBeenCalledWith(expect.objectContaining({ provider: "deterministic-fallback", model: "keyword-analyzer" }))
  })

  it("initializes handoff only while awaiting AI, preserving human work", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    findOrgById.mockResolvedValue(makeOrgDoc())
    createAiResult.mockResolvedValue({ _id: "aiResultId" })
    processTicket.mockResolvedValue({ result: { category: "Network", priority: "Critical", auto_resolve: false, confidence: 0.9 }, trace: { extraction: "success" } })
    await new TicketService().processTicketById("661111111111111111111111", false, "org1")
    expect(updateWorkflow).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1", $or: [{ workflowStatus: "awaiting_ai" }, { workflowStatus: { $exists: false } }] }), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "needs_human", assignedTeam: "Network Support" }) }))
  })

  it("routes failed processing to the helpdesk", async () => {
    findTicketById.mockResolvedValue(makeTicketDoc())
    findOrgById.mockResolvedValue(makeOrgDoc())
    processTicket.mockRejectedValueOnce(new Error("provider failed"))
    await expect(new TicketService().processTicketById("661111111111111111111111", false, "org1")).rejects.toThrow("provider failed")
    expect(updateWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "needs_human", assignedTeam: "IT Helpdesk" }) }))
  })

})
