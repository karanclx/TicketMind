export type TicketRequest = {
  title: string
  description: string
  user_role: "student" | "employee" | "admin"
  timestamp: string
}

export type TicketCreateResponse = {
  id: string
  status: string
  job_id: string
}

export type TicketDetail = {
  created_by: string | null
  workflow: TicketWorkflow
  id: string
  status: "pending" | "processing" | "processed" | "failed"
  created_at: string
  updated_at: string
  raw_input: {
    title: string
    description: string
    user_role: string
    timestamp: string
  }
  normalized: {
    title: string
    description: string
  }
  ai: null | {
    version: number
    provider: string
    model: string
    result: {
      category: string
      priority: string
      summary: string
      root_cause: string
      suggested_resolution: string
      confidence: number
      auto_resolve: boolean
    }
    processed_at: string
  }
}

export type WorkflowStatus = "awaiting_ai" | "awaiting_confirmation" | "needs_human" | "in_progress" | "resolved"
export type TicketWorkflow = {
  status: WorkflowStatus
  team: string
  assignee_id: string | null
  reason: string
  revision: number
  resolution_note: string
  resolved_at: string | null
}
export type SupportAgent = { id: string; email: string; role: string }
export type QueueTicket = {
  id: string; title: string; processing_status: string; status: WorkflowStatus
  team: string; assignee_id: string | null; category: string; priority: string; created_at: string
}
export type QueueResponse = { tickets: QueueTicket[]; total: number; page: number; page_size: number }
export type HandoffUpdate = {
  action: "request_human" | "confirm_fixed" | "assign" | "start" | "resolve" | "reopen"
  expected_revision: number; team?: string; assignee_id?: string | null; note?: string
}
