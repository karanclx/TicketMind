import type { TicketCreateResponse, TicketDetail, TicketRequest } from "./types"

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed with status ${response.status}`
  } catch {
    return `Request failed with status ${response.status}`
  }
}

export const createTicket = async (payload: TicketRequest): Promise<TicketCreateResponse> => {
  const response = await fetch("/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as TicketCreateResponse
}

export const getTicketById = async (id: string): Promise<TicketDetail> => {
  const response = await fetch(`/tickets/${id}`)

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as TicketDetail
}

export const triggerReprocess = async (id: string): Promise<TicketCreateResponse> => {
  const response = await fetch(`/tickets/${id}/process`, {
    method: "POST"
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as TicketCreateResponse
}
