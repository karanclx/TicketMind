import { describe, expect, it } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"

describe("application wiring", () => {
  const app = createApp()
  it("exposes liveness without exposing private queue health", async () => {
    const res = await request(app).get("/health/live")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: "ok" })
    expect((await request(app).get("/health")).status).toBe(401)
  })
  it("returns 401 for unauthenticated ticket requests instead of leaving an async rejection", async () => {
    expect((await request(app).post("/tickets").send({})).status).toBe(401)
  })
  it("returns 400 for invalid signup data without accessing MongoDB", async () => {
    expect((await request(app).post("/auth/signup").send({ email: "invalid" })).status).toBe(400)
  })
})
