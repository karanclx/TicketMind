import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

const { findOneTicket, findOrgById } = vi.hoisted(() => ({
  findOneTicket: vi.fn(),
  findOrgById: vi.fn()
}))

vi.mock("../models/SupportTicket.js", () => ({
  SupportTicketModel: { findOne: findOneTicket, create: vi.fn() }
}))

vi.mock("../models/Organization.js", () => ({
  OrganizationModel: { findById: findOrgById, create: vi.fn() }
}))

import { TicketService } from "../modules/tickets/ticket.service.js"
import { NotFoundError } from "../lib/errors.js"

describe("Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getTicketById throws NotFoundError when ticket exists but organizationId does not match", async () => {
    // Return null to simulate Mongoose not finding the document matching BOTH _id and organizationId
    findOneTicket.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    
    const service = new TicketService()
    
    await expect(service.getTicketById(new Types.ObjectId().toString(), "org-b"))
      .rejects.toThrowError(NotFoundError)
  })

  it("processTicketById throws NotFoundError when ticket exists but organizationId does not match", async () => {
    findOneTicket.mockResolvedValue(null)
    
    const service = new TicketService()
    
    await expect(service.processTicketById(new Types.ObjectId().toString(), false, "org-b"))
      .rejects.toThrowError(NotFoundError)
  })
})
