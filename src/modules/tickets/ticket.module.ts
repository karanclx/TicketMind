import { TicketQueue } from "./ticket.queue.js"
import { ticketService } from "./ticket.service.js"

export const ticketQueue = new TicketQueue(async (payload) => {
  await ticketService.processTicketById(payload.ticketId, payload.incrementReprocessCount)
})
