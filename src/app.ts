import { workspaceRouter } from "./modules/workspace/workspace.routes.js"
import { asyncHandler } from "./lib/async-handler.js"
import { tryAuthThenApiKey } from "./middleware/try-auth-then-api-key.js"
import { supportRouter } from "./modules/support/support.routes.js"

import express from "express"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"

import { errorHandler } from "./middleware/error-handler.js"
import { notFoundHandler } from "./middleware/not-found.js"
import { healthRouter } from "./modules/health/health.routes.js"
import { ticketRouter } from "./modules/tickets/ticket.routes.js"
import { authRoutes } from "./modules/auth/auth.routes.js"
import { billingRouter } from "./modules/billing/billing.routes.js"
import { env } from "./config/env.js"
import cookieParser from "cookie-parser"

export const createApp = () => {
  const app = express()

  app.use(cors({ origin: true, credentials: true }))

  // Mount webhook route BEFORE express.json() so it can use express.raw()
  app.use("/billing/webhook", express.raw({ type: "application/json" }))

  app.use(cookieParser())
  // Authenticate before accepting the larger, base64 image payload.
  app.post("/tickets", asyncHandler(tryAuthThenApiKey), express.json({ limit: "12mb" }))
  app.use(express.json({ limit: "1mb" }))

  // Mount the rest of the billing routes (they use express.json since it's above)
  app.use("/billing", billingRouter)

  app.use("/workspace", (req, res, next) => {
    if (env.NODE_ENV === "production" && req.method === "GET" && req.path === "/" && req.headers.accept?.includes("text/html")) return next()
    workspaceRouter(req, res, next)
  })
  app.use("/support", supportRouter)
  app.use("/auth", authRoutes)
  app.use("/health", healthRouter)
  app.use("/tickets", (req, res, next) => {
    // The browser and API share ticket URLs. Serve the SPA on document navigation.
    if (env.NODE_ENV === "production" && req.method === "GET" && !req.path.includes("/images/") && req.headers.accept?.includes("text/html")) {
      next()
      return
    }
    ticketRouter(req, res, next)
  })

  if (env.NODE_ENV === "production") {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const frontendDistPath = path.join(__dirname, "..", "frontend-dist")

    app.use(express.static(frontendDistPath))
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDistPath, "index.html"))
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
