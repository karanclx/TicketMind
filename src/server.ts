import { AiResultModel } from "./models/AiResult.js"
import { randomUUID } from "node:crypto"
import { startWorkers } from "./modules/integrations/workers.js"
import { SupportTicketModel } from "./models/SupportTicket.js"
import { WebhookDeliveryModel } from "./models/WebhookDelivery.js"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { connectMongo, disconnectMongo } from "./config/db.js"
import { createApp } from "./app.js"

const start = async (): Promise<void> => {
  await connectMongo(env.MONGODB_URI)

  await Promise.all([SupportTicketModel.init(), WebhookDeliveryModel.init(), AiResultModel.init()])
  // Recover tickets created before durable job fields were introduced.
  for await (const ticket of SupportTicketModel.find({ jobStatus: { $exists: false }, status: { $in: ["pending", "processing"] } }).select("_id").lean().cursor()) {
    await SupportTicketModel.updateOne({ _id: ticket._id, jobStatus: { $exists: false } }, { $set: { jobId: randomUUID(), jobStatus: "queued", jobAttempts: 0, jobNextAt: new Date() } })
  }
  const stopWorkers = startWorkers()
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

      stopWorkers().then(() => disconnectMongo())
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
