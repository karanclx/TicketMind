type TicketStatusBadgeProps = {
  status: "pending" | "processing" | "processed" | "failed"
}

export const TicketStatusBadge = ({ status }: TicketStatusBadgeProps) => {
  return <span className={`status status-${status}`}>{status}</span>
}
