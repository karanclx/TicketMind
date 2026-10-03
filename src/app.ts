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

  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  // Mount the rest of the billing routes (they use express.json since it's above)
  app.use("/billing", billingRouter)

  app.use("/auth", authRoutes)
  app.use("/health", healthRouter)
  app.use("/tickets", ticketRouter)

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
