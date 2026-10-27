import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getMyTickets } from "../api"
import { workflowLabels } from "../components/HandoffPanel"
import { Icon } from "../components/ui/icon"

export function MyTicketsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyTickets>> | null>(null)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true); setError("")
    getMyTickets(page).then(result => { if (active) setData(result) }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load tickets") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, refresh])
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 15000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="stack page-enter">
    <section className="page-heading"><div className="eyebrow">YOUR SUPPORT REQUESTS</div><h1>My tickets</h1><p>Raise an issue, review suggestions, and follow your support team’s progress.</p></section>
    <div className="row row-space"><Link to="/new" className="btn button-primary"><Icon name="plus" />Raise a ticket</Link><button className="button-secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" />Refresh</button></div>
    <section className="panel">
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p role="status" className="muted">Loading your requests…</p>}
      {!error && data && <>
        {data.total === 0 ? <div className="analysis-empty"><Icon name="ticket" /><h2>No requests yet</h2><p>When something goes wrong, raise a ticket. Your support team handles assignment and resolution.</p></div> : <div className="queue-list">{data.tickets.map(ticket => <Link className="queue-ticket" to={`/tickets/${ticket.id}`} key={ticket.id}><div><h3>{ticket.title}</h3><p>{ticket.team} · {new Date(ticket.created_at).toLocaleDateString()}</p></div><span className={`status workflow-${ticket.status}`}>{workflowLabels[ticket.status]}</span></Link>)}</div>}
        <div className="queue-pagination"><button className="button-secondary" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.page_size))}</span><button className="button-secondary" disabled={loading || page * data.page_size >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </section>
  </div>
}
