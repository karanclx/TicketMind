export type TicketCategory =
  | "Network"
  | "Login"
  | "Hardware"
  | "Software"
  | "Email"
  | "Access"
  | "Database"
  | "Other"

export type TicketPriority = "Low" | "Medium" | "High" | "Critical"

export type TicketUserRole = "student" | "employee" | "admin" | "customer"

export type IncomingTicket = {
  title: string
  description: string
  user_role: TicketUserRole
  timestamp: string
}

export type AnalyzedTicket = {
  category: string
  priority: TicketPriority
  summary: string
  root_cause: string
  suggested_resolution: string
  confidence: number
  auto_resolve: boolean
}
