type TicketStatusBadgeProps = {
  status: "pending" | "processing" | "processed" | "failed"
}

export const TicketStatusBadge = ({ status }: TicketStatusBadgeProps) => {
  return <span className={`status status-${status}`}><span className="status-dot" />{status === "processed" ? "Analysis complete" : status === "processing" ? "Analyzing" : status === "pending" ? "Queued" : "Processing failed"}</span>
}
