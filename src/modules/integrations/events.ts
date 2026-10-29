import { randomUUID } from "node:crypto"
export function ticketEvent(type: "analysis.completed" | "ticket.updated", ticketId: string, data: Record<string, unknown>) {
  return { id: randomUUID(), type, created_at: new Date().toISOString(), ticket_id: ticketId, data }
}
