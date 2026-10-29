import { settingsFor } from "../workspace/workspace.settings.js"
import crypto from "node:crypto"
import { OrganizationModel } from "../../models/Organization.js"
import { NotFoundError } from "../../lib/errors.js"
import { Router } from "express"
import { requireAuth } from "../../middleware/require-auth.js"
import { requireRole } from "../../middleware/require-role.js"
import { asyncHandler } from "../../lib/async-handler.js"
import { supportService } from "./support.service.js"
import { SUPPORT_ROLES } from "./support-policy.js"
import { addAgentSchema, queueQuerySchema } from "./support.schemas.js"

export const supportRouter = Router()
supportRouter.use(requireAuth, requireRole(SUPPORT_ROLES))
supportRouter.get("/tickets", asyncHandler(async (req, res) => {
  res.json(await supportService.list(req.auth!.organizationId, queueQuerySchema.parse(req.query)))
}))
supportRouter.get("/agents", asyncHandler(async (req, res) => {
  res.json({ agents: await supportService.agents(req.auth!.organizationId), teams: settingsFor(await OrganizationModel.findById(req.auth!.organizationId)).teams })
}))
supportRouter.post("/agents", requireRole(["owner", "admin"]), asyncHandler(async (req, res) => {
  res.status(201).json(await supportService.addAgent(req.auth!.organizationId, addAgentSchema.parse(req.body)))
}))

supportRouter.post("/requester-invite", requireRole(["owner", "admin"]), asyncHandler(async (req, res) => {
  const invite = crypto.randomBytes(24).toString("hex")
  const organization = await OrganizationModel.findByIdAndUpdate(req.auth!.organizationId, {
    $set: { requesterInviteHash: crypto.createHash("sha256").update(invite).digest("hex") }
  })
  if (!organization) throw new NotFoundError("Workspace not found")
  res.json({ invite })
}))
