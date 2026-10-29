import { randomUUID } from "node:crypto"
import { SupportTicketModel } from "../../models/SupportTicket.js"
import { AppError } from "../../lib/errors.js"
import { logger } from "../../config/logger.js"

export type QueuePayload = { ticketId: string; organizationId: string; incrementReprocessCount: boolean }
const LEASE_MS = 10 * 60 * 1000
export class TicketQueue {
  constructor(private readonly processFn: (payload: QueuePayload) => Promise<void>) {}
  async enqueue(ticketId: string, organizationId: string, reprocess = false) {
    if (reprocess) {
      await SupportTicketModel.updateOne({ _id: ticketId, organizationId, jobStatus: { $nin: ["queued", "processing", "retrying"] } }, {
        $set: { jobId: randomUUID(), jobStatus: "queued", jobAttempts: 0, jobNextAt: new Date(), status: "pending" }, $inc: { reprocessCount: 1 }, $unset: { jobError: 1, jobToken: 1, jobLeaseUntil: 1 }
      })
    }
    const ticket = await SupportTicketModel.findOne({ _id: ticketId, organizationId }).select("jobId jobStatus")
    if (!ticket) throw new AppError("Ticket not found", 404)
    return { jobId: ticket.jobId, status: ticket.jobStatus }
  }
  async stats(organizationId: string) {
    const count = (jobStatus: string) => SupportTicketModel.countDocuments({ organizationId, jobStatus })
    const [queued, processing, retrying, completed, deadLetter] = await Promise.all([count("queued"), count("processing"), count("retrying"), count("completed"), count("dead_letter")])
    return { active: processing > 0, queued, processing, retrying, completed, deadLetter }
  }
  async getJobStatus(jobId: string, organizationId: string) {
    return SupportTicketModel.findOne({ organizationId, jobId }).select("jobId jobStatus jobAttempts jobError updatedAt").lean()
  }
  async deadLetterJobs(organizationId: string) {
    return SupportTicketModel.find({ organizationId, jobStatus: "dead_letter" }).select("jobId jobStatus jobAttempts jobError updatedAt").limit(100).lean()
  }
  async runOnce() {
    const now = new Date(), token = randomUUID()
    const ticket = await SupportTicketModel.findOneAndUpdate({ $or: [
      { jobStatus: { $in: ["queued", "retrying"] }, jobNextAt: { $lte: now } },
      { jobStatus: "processing", jobLeaseUntil: { $lte: now } }
    ] }, { $set: { jobStatus: "processing", jobToken: token, jobLeaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { jobAttempts: 1 } }, { new: true, sort: { jobNextAt: 1 } })
    if (!ticket) return
    const filter = { _id: ticket._id, jobToken: token }
    const heartbeat = setInterval(() => {
      void SupportTicketModel.updateOne(filter, { $set: { jobLeaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => logger.warn({}, "Could not renew ticket lease"))
    }, 30000)
    heartbeat.unref()
    try {
      if (ticket.jobAttempts > 3) throw new Error("Retry limit reached")
      await this.processFn({ ticketId: ticket._id.toString(), organizationId: ticket.organizationId.toString(), incrementReprocessCount: false })
      await SupportTicketModel.updateOne(filter, { $set: { jobStatus: "completed" }, $unset: { jobLeaseUntil: 1, jobToken: 1, jobError: 1 } })
    } catch {
      await SupportTicketModel.updateOne(filter, { $set: { jobStatus: ticket.jobAttempts >= 3 ? "dead_letter" : "retrying", jobError: "Processing failed; retry or review the ticket.", ...(ticket.jobAttempts >= 3 ? { status: "failed" } : {}), jobNextAt: new Date(Date.now() + 1000 * 2 ** ticket.jobAttempts) }, $unset: { jobLeaseUntil: 1, jobToken: 1 } })
      if (ticket.jobAttempts >= 3) await SupportTicketModel.updateOne({ _id: ticket._id, workflowStatus: "awaiting_ai", jobStatus: "dead_letter" }, { $set: { workflowStatus: "needs_human", handoffReason: "Processing retry limit reached; support review required." }, $inc: { handoffRevision: 1 } })
    } finally { clearInterval(heartbeat) }
  }
}
