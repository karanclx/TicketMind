import { beforeEach, expect, it, vi } from "vitest"
const { claim, update } = vi.hoisted(() => ({ claim: vi.fn(), update: vi.fn(async () => ({ modifiedCount: 1 })) }))
vi.mock("../models/SupportTicket.js", () => ({ SupportTicketModel: { findOneAndUpdate: claim, updateOne: update } }))
import { TicketQueue } from "../modules/tickets/ticket.queue.js"
beforeEach(() => { vi.clearAllMocks() })
it("claims queued or expired jobs and completes only its own lease", async () => {
  claim.mockResolvedValue({ _id: "ticket", organizationId: "org", jobAttempts: 1 })
  const process = vi.fn(async () => {})
  await new TicketQueue(process).runOnce()
  expect(claim.mock.calls[0][0].$or).toEqual(expect.arrayContaining([expect.objectContaining({ jobStatus: "processing", jobLeaseUntil: { $lte: expect.any(Date) } })]))
  expect(process).toHaveBeenCalledWith({ ticketId: "ticket", organizationId: "org", incrementReprocessCount: false })
  expect(update).toHaveBeenCalledWith({ _id: "ticket", jobToken: expect.any(String) }, expect.objectContaining({ $set: { jobStatus: "completed" } }))
})
it("makes exhausted crashed jobs failed and reviewable without another AI call", async () => {
  claim.mockResolvedValue({ _id: "ticket", organizationId: "org", jobAttempts: 4 })
  const process = vi.fn()
  await new TicketQueue(process).runOnce()
  expect(process).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ jobToken: expect.any(String) }), expect.objectContaining({ $set: expect.objectContaining({ status: "failed", jobStatus: "dead_letter" }) }))
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ workflowStatus: "awaiting_ai" }), expect.objectContaining({ $set: expect.objectContaining({ workflowStatus: "needs_human" }) }))
})
it("persists a backoff time for transient failures", async () => {
  claim.mockResolvedValue({ _id: "ticket", organizationId: "org", jobAttempts: 1 })
  await new TicketQueue(async () => { throw new Error("Transient") }).runOnce()
  expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ jobStatus: "retrying", jobNextAt: expect.any(Date) }) }))
})
