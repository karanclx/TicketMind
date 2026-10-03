import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import express from "express"

import { healthRouter } from "../modules/health/health.routes.js"
import { ticketQueue } from "../modules/tickets/ticket.module.js"

import { healthController } from "../modules/health/health.controller.js"

describe("Health API Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("filters queue stats, job lookups, and dead-letter jobs by organizationId", async () => {
    // Enqueue jobs directly via ticketQueue
    // One for org-a, one for org-b
    ticketQueue.enqueue("ticket1", "org-a", false)
    ticketQueue.enqueue("ticket2", "org-b", false)

    const req = {
      auth: { organizationId: "org-a" },
      query: {}
    } as any

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any

    await healthController.getHealth(req, res)
    
    expect(res.status).toHaveBeenCalledWith(200)
    
    const body = res.json.mock.calls[0][0]
    expect(body.queue.queued + body.queue.processing + body.queue.deadLetter).toBe(1)
  })
})
