import { OrganizationModel } from "../../models/Organization.js"
import { settingsFor } from "../workspace/workspace.settings.js"
import { ticketEvent } from "../integrations/events.js"
import { Types, type FilterQuery } from "mongoose"
import { SupportTicketModel, type SupportTicket } from "../../models/SupportTicket.js"
import { UserModel } from "../../models/User.js"
import { AppError, NotFoundError, ValidationError } from "../../lib/errors.js"
import { hashPassword } from "../../lib/auth.js"
import { SUPPORT_ROLES } from "./support-policy.js"
import type { HandoffInput } from "./support.schemas.js"

type Actor = { userId?: string; organizationId: string; role?: string }
const isSupport = (actor: Actor) => SUPPORT_ROLES.includes(actor.role ?? "")
const isHumanState = (status: string) => ["needs_human", "in_progress"].includes(status)

export class SupportService {
  async list(organizationId: string, query: { status?: string | undefined; team?: string | undefined; page: number }) {
    const filter: FilterQuery<SupportTicket> = { organizationId }
    // Include old processed/failed tickets, which predate the human workflow.
    if (query.status === "needs_human") filter.$or = [{ workflowStatus: "needs_human" }, { workflowStatus: { $exists: false }, status: { $in: ["processed", "failed"] } }]
    else if (query.status) filter.workflowStatus = query.status
    if (query.team) filter.assignedTeam = query.team === "IT Helpdesk" ? { $in: ["IT Helpdesk", null] } : query.team
    const [tickets, total] = await Promise.all([
      SupportTicketModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * 25).limit(25).select("normalizedTitle status workflowStatus assignedTeam assignedTo triageCategory triagePriority createdAt").lean(),
      SupportTicketModel.countDocuments(filter)
    ])
    return { tickets: tickets.map(ticket => ({
      id: ticket._id.toString(), title: ticket.normalizedTitle, processing_status: ticket.status,
      status: ticket.workflowStatus ?? (["processed", "failed"].includes(ticket.status) ? "needs_human" : "awaiting_ai"),
      team: ticket.assignedTeam ?? "IT Helpdesk", assignee_id: ticket.assignedTo?.toString() ?? null,
      category: ticket.triageCategory ?? "Other", priority: ticket.triagePriority ?? "Medium", created_at: ticket.createdAt
    })), total, page: query.page, page_size: 25 }
  }

  async agents(organizationId: string) {
    const users = await UserModel.find({ organizationId, role: { $in: SUPPORT_ROLES } }).select("email role").sort({ email: 1 }).lean()
    return users.map(user => ({ id: user._id.toString(), email: user.email, role: user.role }))
  }

  async addAgent(organizationId: string, input: { email: string; password: string }) {
    const passwordHash = await hashPassword(input.password)
    try {
      const user = await UserModel.create({ organizationId: new Types.ObjectId(organizationId), email: input.email, passwordHash, role: "agent" })
      return { id: user._id.toString(), email: user.email, role: user.role }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new ValidationError("This email already has an account. Use a separate support account email.")
      throw error
    }
  }

  async update(id: string, actor: Actor, input: HandoffInput) {
    const ticket = await SupportTicketModel.findOne({ _id: id, organizationId: actor.organizationId }).lean()
    if (!ticket) throw new NotFoundError("Ticket not found")
    const staff = isSupport(actor)
    const requester = Boolean(actor.userId && ticket.createdBy?.toString() === actor.userId)
    if (!staff && !requester) throw new AppError("Only the requester or support staff can update this ticket", 403, "FORBIDDEN")
    const status = ticket.workflowStatus ?? (["processed", "failed"].includes(ticket.status) ? "needs_human" : "awaiting_ai")
    const patch: Record<string, unknown> = {}
    switch (input.action) {
      case "request_human":
        if (status === "resolved") throw new ValidationError("Reopen the resolved ticket first")
        if (isHumanState(status)) throw new ValidationError("This ticket is already with support")
        Object.assign(patch, { workflowStatus: "needs_human", assignedTeam: ticket.assignedTeam ?? "IT Helpdesk", handoffReason: input.note || "Requester needs human assistance." })
        break
      case "confirm_fixed":
        if (status !== "awaiting_confirmation") throw new ValidationError("This ticket is not awaiting confirmation")
        Object.assign(patch, { workflowStatus: "resolved", resolutionNote: input.note || "Requester confirmed that the suggestion solved the issue.", resolvedBy: actor.userId, resolvedAt: new Date() })
        break
      case "assign":
        if (!staff) throw new AppError("Support staff role required", 403, "FORBIDDEN")
        if (status === "resolved") throw new ValidationError("Reopen the ticket before assigning it")
        if (input.team && !settingsFor(await OrganizationModel.findById(actor.organizationId)).teams.includes(input.team)) throw new ValidationError("Select a team configured for this workspace")
        if (!input.team) throw new ValidationError("Select a support team")
        if (input.assignee_id) {
          const assignee = await UserModel.findOne({ _id: input.assignee_id, organizationId: actor.organizationId, role: { $in: SUPPORT_ROLES } }).lean()
          if (!assignee) throw new ValidationError("Assignee must be support staff in this workspace")
        }
        Object.assign(patch, { assignedTeam: input.team, assignedTo: input.assignee_id ? new Types.ObjectId(input.assignee_id) : null, workflowStatus: "needs_human", handoffReason: input.note || "Assigned to support for review." })
        break
      case "start":
        if (!staff) throw new AppError("Support staff role required", 403, "FORBIDDEN")
        if (!isHumanState(status)) throw new ValidationError("Only tickets in the human queue can be started")
        if (ticket.assignedTo && ticket.assignedTo.toString() !== actor.userId) throw new ValidationError("Ticket is assigned to someone else. Reassign it before starting work.")
        Object.assign(patch, { workflowStatus: "in_progress", assignedTo: new Types.ObjectId(actor.userId) })
        break
      case "resolve":
        if (!staff) throw new AppError("Support staff role required", 403, "FORBIDDEN")
        if (!isHumanState(status)) throw new ValidationError("Only tickets with support can be resolved")
        if (!input.note) throw new ValidationError("A resolution note is required")
        Object.assign(patch, { workflowStatus: "resolved", resolutionNote: input.note, resolvedBy: actor.userId, resolvedAt: new Date() })
        break
      case "reopen":
        if (status !== "resolved") throw new ValidationError("Only resolved tickets can be reopened")
        Object.assign(patch, { workflowStatus: "needs_human", assignedTeam: ticket.assignedTeam ?? "IT Helpdesk", handoffReason: input.note || "Ticket reopened for further support.", resolvedAt: null, resolvedBy: null, resolutionNote: "" })
        break
    }
    const revision = ticket.handoffRevision ?? 0
    if (revision !== input.expected_revision) throw new AppError("Ticket changed. Refresh and try again.", 409, "CONFLICT")
    const updated = await SupportTicketModel.findOneAndUpdate({
      _id: id, organizationId: actor.organizationId,
      ...(revision === 0 ? { $or: [{ handoffRevision: 0 }, { handoffRevision: { $exists: false } }] } : { handoffRevision: revision })
    }, { $set: patch, $inc: { handoffRevision: 1 }, $push: { pendingEvents: ticketEvent("ticket.updated", id, { action: input.action, revision: revision + 1, workflow: patch }) } }, { new: true, runValidators: true }).lean()
    if (!updated) throw new AppError("Ticket changed. Refresh and try again.", 409, "CONFLICT")
    return { success: true }
  }
}
export const supportService = new SupportService()
