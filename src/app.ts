import express from "express"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"

import { errorHandler } from "./middleware/error-handler.js"
import { notFoundHandler } from "./middleware/not-found.js"
import { healthRouter } from "./modules/health/health.routes.js"
import { ticketRouter } from "./modules/tickets/ticket.routes.js"
import { env } from "./config/env.js"

export const createApp = () => {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: "1mb" }))

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
