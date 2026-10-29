import { z } from "zod"
import { SUPPORT_TEAMS } from "../support/support-policy.js"

const label = z.string().trim().min(1).max(80)
export const workspaceSettingsSchema = z.object({
  template: z.enum(["college_it", "food_delivery", "ecommerce", "custom"]),
  categories: z.array(label).min(1).max(30),
  teams: z.array(label).min(1).max(30),
  routes: z.array(z.object({ category: label, team: label }).strict()).max(30),
  instructions: z.string().trim().max(4000),
  imageScreening: z.boolean(),
  escalation: z.object({ alwaysHuman: z.boolean(), minConfidence: z.number().min(0).max(1), priorities: z.array(z.enum(["Low", "Medium", "High", "Critical"])).max(4) }).strict()
}).strict().superRefine((value, ctx) => {
  if (!value.categories.includes("Other")) ctx.addIssue({ code: "custom", message: "Categories must include Other", path: ["categories"] })
  for (const key of ["categories", "teams"] as const) if (new Set(value[key]).size !== value[key].length) ctx.addIssue({ code: "custom", message: "Labels must be unique", path: [key] })
  if (new Set(value.routes.map(route => route.category)).size !== value.routes.length || value.routes.some(route => !value.categories.includes(route.category) || !value.teams.includes(route.team))) ctx.addIssue({ code: "custom", message: "Routes require unique configured categories and existing teams", path: ["routes"] })
})
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>
const escalation = { alwaysHuman: false, minConfidence: 0.75, priorities: ["High", "Critical"] as ("High" | "Critical")[] }
export const WORKSPACE_TEMPLATES: Record<string, WorkspaceSettings> = {
  college_it: { template: "college_it", categories: ["Network", "Login", "Hardware", "Software", "Email", "Access", "Database", "Other"], teams: [...SUPPORT_TEAMS], routes: [{ category: "Network", team: "Network Support" }, { category: "Login", team: "Account Support" }, { category: "Email", team: "Account Support" }, { category: "Access", team: "Account Support" }, { category: "Hardware", team: "Hardware Support" }, { category: "Software", team: "Application Support" }, { category: "Database", team: "Database Support" }], instructions: "Help students and staff resolve college IT issues.", imageScreening: true, escalation },
  food_delivery: { template: "food_delivery", categories: ["Missing item", "Damaged food", "Wrong order", "Delivery delay", "Payment", "Other"], teams: ["Customer Support", "Delivery Support", "Refund Review"], routes: [{ category: "Delivery delay", team: "Delivery Support" }, { category: "Payment", team: "Refund Review" }, { category: "Damaged food", team: "Refund Review" }], instructions: "Handle food-delivery complaints. Ask staff to verify the order and delivery records. Never promise or execute a refund. Treat food-safety complaints as urgent.", imageScreening: true, escalation: { ...escalation, alwaysHuman: true } },
  ecommerce: { template: "ecommerce", categories: ["Return", "Damaged product", "Wrong item", "Shipment delay", "Payment", "Other"], teams: ["Customer Support", "Returns", "Logistics"], routes: [{ category: "Return", team: "Returns" }, { category: "Damaged product", team: "Returns" }, { category: "Shipment delay", team: "Logistics" }], instructions: "Handle retail support. Verify order details and return eligibility with staff. Never authorize payment, refund or replacement actions.", imageScreening: true, escalation: { ...escalation, alwaysHuman: true } }
}
export function settingsFor(organization: { settings?: unknown } | null | undefined = undefined): WorkspaceSettings {
  const parsed = workspaceSettingsSchema.safeParse(organization?.settings)
  return parsed.success ? parsed.data : structuredClone(WORKSPACE_TEMPLATES["college_it"]!)
}
