import { afterEach, describe, expect, it, vi } from "vitest"

import { logger } from "../config/logger.js"

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("serializes Error instances instead of emitting {}", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    logger.error({ error: new Error("boom") }, "Unhandled server error")

    expect(spy).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      error: { name: string; message: string; stack?: string }
    }
    expect(line.error.name).toBe("Error")
    expect(line.error.message).toBe("boom")
    expect(line.error.stack).toContain("boom")
  })

  it("serializes Error values nested inside the context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    logger.error({ details: { inner: new TypeError("nested") } }, "Wrapped")

    const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      details: { inner: { name: string; message: string } }
    }
    expect(line.details.inner).toMatchObject({ name: "TypeError", message: "nested" })
  })
})
