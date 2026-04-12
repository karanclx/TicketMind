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
  id: string
  status: "pending" | "processing" | "processed" | "failed"
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
