import { EvidencePanel } from "../components/EvidencePanel"
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getTicketById, triggerReprocess } from "../api"
import { Icon } from "../components/ui/icon"
import { useAuth } from "../auth"
import { HandoffPanel } from "../components/HandoffPanel"
import { AiResultCard } from "../components/AiResultCard"
import { TicketStatusBadge } from "../components/TicketStatusBadge"
import type { TicketDetail } from "../types"

const POLL_INTERVAL_MS = 2000

export const TicketDetailPage = () => {
  const { user } = useAuth()
  const staff = ["owner", "admin", "agent"].includes(user?.role)
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReprocessing, setIsReprocessing] = useState(false)

  const shouldPoll = useMemo(
    () => ticket?.status === "pending" || ticket?.status === "processing",
    [ticket?.status]
  )

  const load = async (): Promise<void> => {
    if (!id) {
      return
    }

    try {
      setError(null)
      const data = await getTicketById(id)
      setTicket(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load ticket")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    if (!id) {
      return
    }

    const timer = window.setInterval(() => {
      void load()
    }, shouldPoll ? POLL_INTERVAL_MS : 10000)

    return () => {
      window.clearInterval(timer)
    }
  }, [shouldPoll, id])

  const onReprocess = async (): Promise<void> => {
    if (!id) {
      return
    }

    setIsReprocessing(true)
    setError(null)
    try {
      await triggerReprocess(id)
      await load()
    } catch (reprocessError) {
      setError(reprocessError instanceof Error ? reprocessError.message : "Failed to reprocess ticket")
    } finally {
      setIsReprocessing(false)
    }
  }

  if (isLoading) {
    return <div className="panel loading-state" role="status"><span className="loader" />Loading ticket…</div>
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error" role="alert">{error}</p>
        <Link to="/">Back</Link>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="panel">
        <p>Ticket not found.</p>
        <Link to="/">Back</Link>
      </div>
    )
  }

  return (
    <div className="stack page-enter">
      <Link className="back-link" to={staff ? "/queue" : "/my-tickets"}><Icon name="back" />{staff ? "Back to support queue" : "Back to my tickets"}</Link>
      <section className="panel ticket-overview">
        <div className="eyebrow">SUPPORT REQUEST <span className="ticket-id">#{id?.slice(-8).toUpperCase()}</span></div>
        <div className="row row-space">
          <h1>{ticket.raw_input.title}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>

        <p className="reading-text ticket-description">{ticket.raw_input.description}</p>

        <div className="meta ticket-meta">
          <span>
            <strong>User role:</strong> {ticket.raw_input.user_role}
          </span>
          <span>
            <strong>Submitted:</strong> {new Date(ticket.raw_input.timestamp).toLocaleString()}
          </span>
        </div>

        <div className="row ticket-actions">
          {staff && <button className="button-secondary" onClick={() => void onReprocess()} disabled={isReprocessing || shouldPoll}>
            <Icon name="refresh" />{isReprocessing ? "Reprocessing…" : "Reprocess"}
          </button>}
          <Link className="button-ghost" to="/new"><Icon name="plus" />New ticket</Link>
        </div>
      </section>

      {(ticket.external_ticket_id || ticket.external_customer_id || Object.keys(ticket.metadata ?? {}).length > 0) && <section className="panel"><h2>Company reference</h2>
        {ticket.external_ticket_id && <p>External ticket: {ticket.external_ticket_id}</p>}
        {ticket.external_customer_id && <p>External customer: {ticket.external_customer_id}</p>}
        {Object.entries(ticket.metadata ?? {}).map(([key, value]) => <p key={key}><strong>{key}:</strong> {String(value ?? "—")}</p>)}
      </section>}
      <EvidencePanel ticket={ticket} />
      <HandoffPanel ticket={ticket} onUpdate={load} />
      <AiResultCard ai={ticket.ai} />
    </div>
  )
}
