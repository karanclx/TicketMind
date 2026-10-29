import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import https from "node:https"
import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { env } from "../../config/env.js"

// Accept only public IPv4 destinations; pin DNS results to the actual connection.
export function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}
export function parseWebhookUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.hash || url.search || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || (isIP(url.hostname) && !isPublicIPv4(url.hostname))) throw new Error("Use a public HTTPS URL on port 443, without credentials, query or fragment")
  return url
}
const key = () => createHash("sha256").update(env.SESSION_SECRET).digest()
export function encryptSecret(secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(item => item.toString("base64")).join(".")
}
export function decryptSecret(value: string) {
  const [iv, tag, data] = value.split(".").map(item => Buffer.from(item, "base64"))
  if (!iv || !tag || !data) throw new Error("Invalid secret")
  const decipher = createDecipheriv("aes-256-gcm", key(), iv); decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
export const webhookSignature = (secret: string, timestamp: string, body: string) => createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
export async function sendWebhook(endpoint: string, encryptedSecret: string, eventId: string, body: string) {
  const url = parseWebhookUrl(endpoint)
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(item => !isPublicIPv4(item.address))) throw new Error("Webhook destination is not public")
  const address = addresses[0]!.address
  const timestamp = Math.floor(Date.now() / 1000).toString()
  return new Promise<number>((resolve, reject) => {
    const req = https.request(url, { method: "POST", agent: false, family: 4, lookup: (_host, _options, cb) => cb(null, address, 4), headers: {
      "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-TicketMind-Event-Id": eventId,
      "X-TicketMind-Timestamp": timestamp, "X-TicketMind-Signature": `v1=${webhookSignature(decryptSecret(encryptedSecret), timestamp, body)}`
    } }, res => {
      const status = res.statusCode ?? 500
      res.destroy() // No response bodies or redirect destinations are consumed.
      resolve(status)
    })
    const timer = setTimeout(() => req.destroy(new Error("Webhook timeout")), 10000)
    req.on("close", () => clearTimeout(timer)); req.on("error", reject)
    req.end(body)
  })
}
