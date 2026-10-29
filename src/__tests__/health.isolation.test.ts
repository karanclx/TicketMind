import { expect, it, vi } from "vitest"
const { count, find, one } = vi.hoisted(() => ({ count: vi.fn(async () => 1), find: vi.fn(() => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })), one: vi.fn(() => ({ select: () => ({ lean: async () => null }) })) }))
vi.mock("../models/SupportTicket.js", () => ({ SupportTicketModel: { countDocuments: count, find, findOne: one } }))
import { TicketQueue } from "../modules/tickets/ticket.queue.js"
it("scopes durable queue counts, job lookup and dead letters to the workspace", async () => {
  const queue = new TicketQueue(async () => {})
  expect((await queue.stats("org-a")).queued).toBe(1)
  await queue.getJobStatus("job-b", "org-a")
  await queue.deadLetterJobs("org-a")
  for (const [filter] of count.mock.calls as unknown as [{ organizationId: string }][]) expect(filter.organizationId).toBe("org-a")
  expect(one).toHaveBeenCalledWith({ jobId: "job-b", organizationId: "org-a" })
  expect(find).toHaveBeenCalledWith({ organizationId: "org-a", jobStatus: "dead_letter" })
})
