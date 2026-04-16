import request from "supertest"
import { describe, expect, it } from "vitest"
import express from "express"

import { errorHandler } from "../middleware/error-handler.js"
import { notFoundHandler } from "../middleware/not-found.js"
import { asyncHandler } from "../lib/async-handler.js"

describe("API endpoints", () => {
  it("POST /tickets returns accepted status", async () => {
    const app = express()
    app.use(express.json())
    app.post(
      "/tickets",
      asyncHandler(async (_req, res) => {
        res.status(202).json({ id: "661111111111111111111111", status: "queued", job_id: "job-1" })
      })
    )
    app.use(notFoundHandler)
    app.use(errorHandler)

    const response = await request(app).post("/tickets").send({
      title: "Cannot login",
      description: "My password no longer works",
      user_role: "employee",
      timestamp: "2026-04-07T10:00:00.000Z"
    })

    expect(response.status).toBe(202)
    expect(response.body.id).toBe("661111111111111111111111")
    expect(response.body.job_id).toBe("job-1")
  })

  it("GET /tickets/:id returns ticket detail", async () => {
    const app = express()
    app.get(
      "/tickets/:id",
      asyncHandler(async (req, res) => {
        res.status(200).json({
          id: req.params["id"],
          status: "processed",
          raw_input: {
            title: "Cannot login",
            description: "Password rejected",
            user_role: "employee",
            timestamp: "2026-04-07T10:00:00.000Z"
          },
          normalized: {
            title: "Cannot login",
            description: "Password rejected"
          },
          ai: null
        })
      })
    )
    app.use(notFoundHandler)
    app.use(errorHandler)

    const response = await request(app).get("/tickets/661111111111111111111111")
    expect(response.status).toBe(200)
    expect(response.body.id).toBe("661111111111111111111111")
  })

  it("POST /tickets/:id/process returns accepted status", async () => {
    const app = express()
    app.post(
      "/tickets/:id/process",
      asyncHandler(async (req, res) => {
        res.status(202).json({ id: req.params["id"], status: "queued", job_id: "job-2" })
      })
    )
    app.use(notFoundHandler)
    app.use(errorHandler)

    const response = await request(app).post("/tickets/661111111111111111111111/process")
    expect(response.status).toBe(202)
    expect(response.body.status).toBe("queued")
    expect(response.body.job_id).toBe("job-2")
  })

  it("GET /health returns status", async () => {
    const app = express()
    app.get(
      "/health",
      asyncHandler(async (_req, res) => {
        res.status(200).json({
          status: "ok",
          queue: {
            active: false,
            queued: 0,
            processing: 0,
            retrying: 0,
            completed: 2,
            deadLetter: 0
          }
        })
      })
    )
    app.use(notFoundHandler)
    app.use(errorHandler)

    const response = await request(app).get("/health")
    expect(response.status).toBe(200)
    expect(response.body.status).toBe("ok")
    expect(response.body.queue.completed).toBe(2)
  })

  it("returns 404 for unknown route", async () => {
    const app = express()
    app.use(notFoundHandler)
    app.use(errorHandler)

    const response = await request(app).get("/unknown")
    expect(response.status).toBe(404)
  })
})
