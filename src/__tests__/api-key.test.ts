import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import express from "express"
import { Types } from "mongoose"

const { mockFindKey, mockCreateTicket } = vi.hoisted(() => ({
  mockFindKey: vi.fn(),
  mockCreateTicket: vi.fn()
}))

vi.mock("../models/ApiKey.js", () => ({
  ApiKeyModel: { findOne: mockFindKey }
}))

// We need to mock verifyApiKey from lib/auth since we mock the model anyway?
// Actually tryAuthThenApiKey calls verifyApiKey which hashes the incoming key and finds it.
// Let's just mock crypto to return predictable hashes if we want, or better: mock ApiKeyModel.findOne.
// verifyApiKey does:
// const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex")
// const keyDoc = await ApiKeyModel.findOne({ keyHash: hashedKey })

vi.mock("../models/SupportTicket.js", () => ({
  SupportTicketModel: {
    create: mockCreateTicket,
    findOne: vi.fn(),
    findById: vi.fn()
  }
}))

// Must import app logic after mocks
import { ticketRouter } from "../modules/tickets/ticket.routes.js"
import crypto from "crypto"

import { errorHandler } from "../middleware/error-handler.js"
import { notFoundHandler } from "../middleware/not-found.js"
import { generateApiKey } from "../lib/auth.js"

describe("API Key Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("authenticates POST /tickets via X-API-Key and scopes ticket to organization", async () => {
    const app = express()
    app.use(express.json())
    app.use("/tickets", ticketRouter)
    app.use(notFoundHandler)
    app.use(errorHandler)

    const orgId = new Types.ObjectId()
    const { raw, hash, prefix } = generateApiKey()

    // Mock the API key lookup
    mockFindKey.mockImplementation(async (query) => {
      if (query.keyPrefix === prefix) {
        return {
          _id: new Types.ObjectId(),
          organizationId: orgId,
          keyPrefix: prefix,
          keyHash: hash,
          lastUsedAt: null,
          save: vi.fn().mockResolvedValue(true)
        }
      }
      return null
    })

    // Mock ticket creation to return an ID
    mockCreateTicket.mockResolvedValue({
      _id: new Types.ObjectId(),
      organizationId: orgId
    })

    const payload = {
      title: "API test ticket",
      description: "Should be tied to org",
      user_role: "employee",
      timestamp: new Date().toISOString()
    }

    const response = await request(app)
      .post("/tickets")
      .set("X-API-Key", raw)
      .send(payload)

    expect(response.status).toBe(202)
    
    // Verify the ticket was created with the correct organizationId
    expect(mockCreateTicket).toHaveBeenCalledTimes(1)
    const createdArgs = mockCreateTicket.mock.calls[0][0]
    expect(createdArgs.organizationId.toString()).toBe(orgId.toString())
  })
})
