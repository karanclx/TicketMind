import { afterEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import { analyzeImage, evidenceStatus, prepareImages } from "../modules/evidence/evidence.service.js"
import { createTicketSchema } from "../modules/tickets/ticket.schemas.js"
import { env } from "../config/env.js"

const original = { user: env.SIGHTENGINE_API_USER, secret: env.SIGHTENGINE_API_SECRET }
afterEach(() => { env.SIGHTENGINE_API_USER = original.user; env.SIGHTENGINE_API_SECRET = original.secret; vi.unstubAllGlobals() })
describe("image evidence", () => {
  it("validates decoded bytes, not filename or supplied MIME", async () => {
    const data = await sharp({ create: { width: 224, height: 224, channels: 3, background: "red" } }).png().toBuffer()
    const [image] = await prepareImages([{ name: "photo.jpg", base64: data.toString("base64") }])
    expect(image?.mime).toBe("image/png")
    expect(image?.data).toEqual(data)
    await expect(prepareImages([{ name: "photo.png", base64: Buffer.from("<svg></svg>").toString("base64") }])).rejects.toThrow("valid, still")
    await expect(prepareImages([{ name: "photo.jpg", base64: Buffer.from("not an image").toString("base64") }])).rejects.toThrow("valid, still")
  })
  it("rejects oversized uploads and excessive attachment count", async () => {
    await expect(prepareImages([{ name: "large.png", base64: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64") }])).rejects.toThrow("4 MB")
    const payload = { title: "Photo", description: "Evidence", user_role: "student", timestamp: new Date().toISOString(), images: Array(3).fill({ name: "a.png", base64: "YQ==" }) }
    expect(createTicketSchema.safeParse(payload).success).toBe(false)
  })
  it("keeps uncertainty separate from high and low signals", () => {
    expect(evidenceStatus(0.2)).toBe("low_signal")
    expect(evidenceStatus(0.5)).toBe("inconclusive")
    expect(evidenceStatus(0.8)).toBe("review_required")
  })
  it("does not contact the network when unconfigured", async () => {
    env.SIGHTENGINE_API_USER = ""
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    expect((await analyzeImage(Buffer.from("test"))).status).toBe("unavailable")
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(["timeout", "unauthorized", "quota exhausted", "provider failure", "invalid score", "missing result"])("fails closed for %s", async mode => {
    env.SIGHTENGINE_API_USER = "test-user"; env.SIGHTENGINE_API_SECRET = "test-key"
    const fetch = vi.fn().mockImplementation(async () => {
      if (mode === "timeout") throw new Error("Timeout")
      if (mode === "unauthorized") return new Response("", { status: 401 })
      if (mode === "quota exhausted") return new Response("", { status: 429 })
      if (mode === "provider failure") return Response.json({ status: "failure", type: { ai_generated: 0.1 } })
      return Response.json(mode === "invalid score" ? { status: "success", type: { ai_generated: 2 } } : { status: "success" })
    }); vi.stubGlobal("fetch", fetch)
    const result = await analyzeImage(Buffer.from("test"))
    expect(result.status).toBe("unavailable"); expect(result.score).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("uploads private bytes with genai and credentials in multipart fields", async () => {
    env.SIGHTENGINE_API_USER = "test-user"; env.SIGHTENGINE_API_SECRET = "private-key"
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "success", type: { ai_generated: 0.9 } })); vi.stubGlobal("fetch", fetch)
    expect(await analyzeImage(Buffer.from("test"), "image/png")).toMatchObject({ status: "review_required", score: 0.9, detectorModel: "sightengine/genai" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith("https://api.sightengine.com/1.0/check.json", expect.objectContaining({ redirect: "error", method: "POST" }))
    const body = fetch.mock.calls[0]![1].body as FormData
    expect(body.get("models")).toBe("genai")
    expect(body.get("api_user")).toBe("test-user")
    expect(body.get("api_secret")).toBe("private-key")
    expect(await (body.get("media") as Blob).text()).toBe("test")
    expect((body.get("media") as Blob).type).toBe("image/png")
    expect(body.has("url")).toBe(false)
  })
})
