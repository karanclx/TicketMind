import sharp from "sharp"
import { z } from "zod"
import { env } from "../../config/env.js"
import { ValidationError } from "../../lib/errors.js"

export const imageInputSchema = z.object({
  name: z.string().min(1).max(150),
  base64: z.string().min(4).max(5592408).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
})
const resultSchema = z.object({ status: z.literal("success"), type: z.object({ ai_generated: z.number().finite().min(0).max(1) }) })
export const evidenceStatus = (score: number) => score >= 0.8 ? "review_required" : score <= 0.2 ? "low_signal" : "inconclusive"

export async function prepareImages(inputs: z.infer<typeof imageInputSchema>[]) {
  const images = []
  for (const input of inputs) {
    const data = Buffer.from(input.base64, "base64")
    if (data.length > 4 * 1024 * 1024) throw new ValidationError("Each image must be at most 4 MB")
    try {
      const decoder = sharp(data, { limitInputPixels: 20000000, failOn: "warning" })
      const meta = await decoder.metadata()
      if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw new Error("Unsupported format")
      if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 224) throw new Error("Image too small")
      // Decode fully to reject corrupt images, retaining the original bytes for the detector.
      await decoder.raw().toBuffer()
      images.push({ name: input.name, data, mime: `image/${meta.format}`, status: "pending" })
    } catch {
      throw new ValidationError("Upload a valid, still JPEG, PNG or WebP image (at least 224px on each side, maximum 20 megapixels)")
    }
  }
  return images
}

// Space requests across this process to respect the free plan's 1 request/second.
let nextRequestAt = 0
export async function analyzeImage(data: Buffer, mime = "application/octet-stream") {
  const unavailable = { status: "unavailable", score: null, detectorModel: "", checkedAt: new Date() }
  if (!env.SIGHTENGINE_API_USER || !env.SIGHTENGINE_API_SECRET) return unavailable
  try {
    const waitMs = Math.max(0, nextRequestAt - Date.now())
    nextRequestAt = Date.now() + waitMs + 1100
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs))
    const body = new FormData()
    body.set("models", "genai")
    body.set("api_user", env.SIGHTENGINE_API_USER)
    body.set("api_secret", env.SIGHTENGINE_API_SECRET)
    body.set("media", new Blob([new Uint8Array(data)], { type: mime }), "evidence")
    // No automatic retries or alternate paid providers; errors remain reviewable.
    const response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST", body, signal: AbortSignal.timeout(env.SIGHTENGINE_TIMEOUT_MS), redirect: "error"
    })
    if (!response.ok) return unavailable
    const result = resultSchema.parse(await response.json())
    const score = result.type.ai_generated
    return { status: evidenceStatus(score), score, detectorModel: "sightengine/genai", checkedAt: new Date() }
  } catch { return unavailable }
}
