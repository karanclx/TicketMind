import { logger } from "../../config/logger.js"
import { ticketQueue } from "../tickets/ticket.module.js"
import { dispatchOutbox, deliverWebhook } from "./webhook.worker.js"
export function startWorkers() {
  let stopping = false
  const loops = [() => ticketQueue.runOnce(), dispatchOutbox, deliverWebhook].map(async run => {
    while (!stopping) {
      try { await run() } catch { logger.warn({}, "Background worker failed; will retry") }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
  return async () => { stopping = true; await Promise.all(loops) }
}
