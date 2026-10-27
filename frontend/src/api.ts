import type { TicketCreateResponse, TicketDetail, TicketRequest } from "./types"

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed with status ${response.status}`
  } catch {
    return `Request failed with status ${response.status}`
  }
}

const defaultOptions: RequestInit = {
  credentials: "include"
}

export const login = async (payload: any): Promise<void> => {
  const response = await fetch("/auth/login", {
    ...defaultOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export const signup = async (payload: any): Promise<void> => {
  const { accountType, ...body } = payload
  const response = await fetch(accountType === "workspace" ? "/auth/workspace" : "/auth/signup", {
    ...defaultOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export const logout = async (): Promise<void> => {
  const response = await fetch("/auth/logout", {
    ...defaultOptions,
    method: "POST"
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export const getMe = async (): Promise<any> => {
  const response = await fetch("/auth/me", defaultOptions)
  if (!response.ok) throw new Error(await parseError(response))
  return await response.json()
}

export const createTicket = async (payload: TicketRequest): Promise<TicketCreateResponse> => {
  const response = await fetch("/tickets", {
    ...defaultOptions,
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
  const response = await fetch(`/tickets/${id}`, defaultOptions)

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as TicketDetail
}

export const triggerReprocess = async (id: string): Promise<TicketCreateResponse> => {
  const response = await fetch(`/tickets/${id}/process`, {
    ...defaultOptions,
    method: "POST"
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as TicketCreateResponse
}

async function supportRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...defaultOptions, ...options })
  if (!response.ok) throw new Error(await parseError(response))
  return await response.json() as T
}

export const listSupportTickets = (query: URLSearchParams) => supportRequest<import("./types").QueueResponse>(`/support/tickets?${query}`)
export const getSupportAgents = () => supportRequest<{ agents: import("./types").SupportAgent[]; teams: string[] }>("/support/agents")
export const updateHandoff = (id: string, payload: import("./types").HandoffUpdate) => supportRequest<{ success: boolean }>(`/tickets/${id}/handoff`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
})
export const addSupportAgent = (payload: { email: string; password: string }) => supportRequest<import("./types").SupportAgent>("/support/agents", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
})

export const createRequesterInvite = () => supportRequest<{ invite: string }>("/support/requester-invite", { method: "POST" })
export const getMyTickets = (page: number) => supportRequest<{ tickets: { id: string; title: string; status: import("./types").WorkflowStatus; team: string; created_at: string }[]; total: number; page: number; page_size: number }>(`/tickets/mine?page=${page}`)
