import { Router } from "express"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { requireAuth } from "../../middleware/require-auth.js"
import { requireRole } from "../../middleware/require-role.js"
import { asyncHandler } from "../../lib/async-handler.js"
import { AppError } from "../../lib/errors.js"
import { generateApiKey } from "../../lib/auth.js"
import { OrganizationModel } from "../../models/Organization.js"
import { ApiKeyModel } from "../../models/ApiKey.js"
import { WebhookDeliveryModel } from "../../models/WebhookDelivery.js"
import { settingsFor, WORKSPACE_TEMPLATES, workspaceSettingsSchema } from "./workspace.settings.js"
import { encryptSecret, parseWebhookUrl } from "../integrations/webhook.transport.js"

export const workspaceRouter = Router()
workspaceRouter.use(requireAuth)
workspaceRouter.get("/settings", asyncHandler(async (req, res) => {
  const org = await OrganizationModel.findById(req.auth!.organizationId)
  if (!org) throw new AppError("Workspace not found", 404)
  res.json({ settings: settingsFor(org) })
}))
workspaceRouter.use(requireRole(["owner", "admin"]))
workspaceRouter.get("/templates", (_req, res) => { res.json(WORKSPACE_TEMPLATES) })
workspaceRouter.put("/settings", asyncHandler(async (req, res) => {
  const settings = workspaceSettingsSchema.parse(req.body)
  const org = await OrganizationModel.findByIdAndUpdate(req.auth!.organizationId, { $set: { settings } }, { new: true })
  if (!org) throw new AppError("Workspace not found", 404)
  res.json({ settings: settingsFor(org) })
}))
workspaceRouter.get("/integration", asyncHandler(async (req, res) => {
  const organizationId = req.auth!.organizationId
  const [org, keys, deliveries] = await Promise.all([
    OrganizationModel.findById(organizationId),
    ApiKeyModel.find({ organizationId }).select("name keyPrefix lastUsedAt revokedAt createdAt").sort({ createdAt: -1 }).lean(),
    WebhookDeliveryModel.find({ organizationId }).select("eventId status attempts lastStatus createdAt updatedAt").sort({ createdAt: -1 }).limit(50).lean()
  ])
  res.json({ webhook_url: org?.webhookUrl ?? "", keys, deliveries })
}))
workspaceRouter.post("/keys", asyncHandler(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body)
  const key = generateApiKey()
  const doc = await ApiKeyModel.create({ organizationId: req.auth!.organizationId, name, keyHash: key.hash, keyPrefix: key.prefix })
  res.status(201).json({ id: doc._id, key: key.raw })
}))
workspaceRouter.delete("/keys/:id", asyncHandler(async (req, res) => {
  const id = z.string().regex(/^[a-f0-9]{24}$/i).parse(req.params["id"])
  await ApiKeyModel.updateOne({ _id: id, organizationId: req.auth!.organizationId }, { $set: { revokedAt: new Date() } })
  res.json({ success: true })
}))
workspaceRouter.put("/webhook", asyncHandler(async (req, res) => {
  const { url } = z.object({ url: z.string().max(2000) }).strict().parse(req.body)
  if (url) { try { parseWebhookUrl(url) } catch { throw new AppError("Use a public HTTPS URL on port 443, without credentials, query or fragment", 400) } }
  const secret = url ? randomBytes(32).toString("hex") : ""
  await OrganizationModel.updateOne({ _id: req.auth!.organizationId }, { $set: { webhookUrl: url, webhookSecret: secret ? encryptSecret(secret) : "" } })
  res.json({ webhook_url: url, secret })
}))
workspaceRouter.post("/deliveries/:id/retry", asyncHandler(async (req, res) => {
  const id = z.string().regex(/^[a-f0-9]{24}$/i).parse(req.params["id"])
  const updated = await WebhookDeliveryModel.updateOne({ _id: id, organizationId: req.auth!.organizationId, status: "failed" }, { $set: { status: "pending", attempts: 0, nextAt: new Date() } })
  if (!updated.modifiedCount) throw new AppError("Failed delivery not found", 404)
  res.json({ success: true })
}))
