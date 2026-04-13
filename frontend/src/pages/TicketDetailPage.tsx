import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getTicketById, triggerReprocess } from "../api"
import { AiResultCard } from "../components/AiResultCard"
import { TicketStatusBadge } from "../components/TicketStatusBadge"
import type { TicketDetail } from "../types"

const POLL_INTERVAL_MS = 2000

export const TicketDetailPage = () => {
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
    if (!shouldPoll) {
      return
    }

    const timer = window.setInterval(() => {
      void load()
    }, POLL_INTERVAL_MS)

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
    return <div className="panel">Loading ticket...</div>
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
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
    <div className="stack">
      <section className="panel">
        <div className="row row-space">
          <h2>{ticket.raw_input.title}</h2>
          <TicketStatusBadge status={ticket.status} />
        </div>

        <p>{ticket.raw_input.description}</p>

        <div className="meta">
          <span>
            <strong>User role:</strong> {ticket.raw_input.user_role}
          </span>
          <span>
            <strong>Submitted:</strong> {new Date(ticket.raw_input.timestamp).toLocaleString()}
          </span>
        </div>

        <div className="row">
          <button onClick={() => void onReprocess()} disabled={isReprocessing}>
            {isReprocessing ? "Reprocessing..." : "Reprocess"}
          </button>
          <Link to="/">New Ticket</Link>
        </div>
      </section>

      <AiResultCard ai={ticket.ai} />
    </div>
  )
}
