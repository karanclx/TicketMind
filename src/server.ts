import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { connectMongo, disconnectMongo } from "./config/db.js"
import { createApp } from "./app.js"

const start = async (): Promise<void> => {
  await connectMongo(env.MONGODB_URI)

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "TicketMind API started")
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down server")
    server.close((error) => {
      if (error) {
        logger.error({ error }, "Error during HTTP server shutdown")
        process.exit(1)
        return
      }

      disconnectMongo()
        .then(() => process.exit(0))
        .catch((disconnectError: unknown) => {
          logger.error({ error: disconnectError }, "Error during MongoDB disconnect")
          process.exit(1)
        })
    })
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

start().catch((error: unknown) => {
  logger.fatal({ error }, "Failed to start server")
  process.exit(1)
})
