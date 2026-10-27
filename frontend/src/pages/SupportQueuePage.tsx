import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { createRequesterInvite, addSupportAgent, getSupportAgents, listSupportTickets } from "../api"
import { useAuth } from "../auth"
import type { QueueResponse, SupportAgent } from "../types"
import { workflowLabels } from "../components/HandoffPanel"
import { Icon } from "../components/ui/icon"

export function SupportQueuePage() {
  const { user } = useAuth()
  const staff = ["owner", "admin", "agent"].includes(user?.role)
  const manager = ["owner", "admin"].includes(user?.role)
  const [data, setData] = useState<QueueResponse | null>(null)
  const [agents, setAgents] = useState<SupportAgent[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [status, setStatus] = useState("needs_human")
  const [team, setTeam] = useState("")
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [adding, setAdding] = useState(false)
  const [inviteLink, setInviteLink] = useState("")
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [agentMessage, setAgentMessage] = useState("")
  useEffect(() => {
    if (!staff) return
    getSupportAgents().then(result => { setAgents(result.agents); setTeams(result.teams) }).catch(err => setError(err instanceof Error ? err.message : "Could not load staff"))
  }, [staff, refresh])
  useEffect(() => {
    if (!staff) return
    let active = true
    setLoading(true); setError("")
    const query = new URLSearchParams({ page: String(page) })
    if (status) query.set("status", status)
    if (team) query.set("team", team)
    listSupportTickets(query).then(result => { if (active) setData(result) }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load queue") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status, team, page, refresh, staff])
  useEffect(() => {
    if (!staff) return
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30000)
    return () => window.clearInterval(timer)
  }, [staff])
  async function generateInvite() {
    setInviteBusy(true); setInviteError("")
    try {
      const { invite } = await createRequesterInvite()
      setInviteLink(`${window.location.origin}/signup?invite=${invite}`)
    } catch (err) { setInviteError(err instanceof Error ? err.message : "Could not create signup link") }
    finally { setInviteBusy(false) }
  }
  async function addAgent(event: React.FormEvent) {
    event.preventDefault(); setAdding(true); setAgentMessage("")
    try {
      await addSupportAgent({ email, password })
      setAgentMessage(`Support account created for ${email}. Share the credentials securely; no email has been sent.`)
      setEmail(""); setPassword(""); setRefresh(value => value + 1)
    } catch (err) { setAgentMessage(err instanceof Error ? err.message : "Could not add agent") }
    finally { setAdding(false) }
  }
  if (!staff) return <section className="panel"><h1>Support access required</h1><p className="muted">Your workspace owner can create a support account for you.</p><Link to="/">Back to workspace</Link></section>
  return <div className="page-enter stack">
    <section className="page-heading"><div className="eyebrow">THE HUMAN SIDE OF SUPPORT</div><h1>Support queue</h1><p>Pick up where AI leaves off. Assign an owner, track the work, and close the loop.</p></section>
    <section className="panel">
      <div className="queue-filters">
        <label className="field"><span>Resolution status</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">All tickets</option>{Object.entries(workflowLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>Team</span><select value={team} onChange={e => { setTeam(e.target.value); setPage(1) }}><option value="">All support teams</option>{teams.map(item => <option key={item}>{item}</option>)}</select></label>
        <button className="button-secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}><Icon name="refresh" />Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="muted" role="status">Loading queue…</p>}
      {!error && data && <>
        <p className="muted queue-count">{data.total} matching ticket{data.total === 1 ? "" : "s"} · refreshed every 30 seconds</p>
        {data.tickets.length === 0 ? <div className="analysis-empty"><Icon name="check" /><h2>No tickets in this view</h2><p>New human handoffs will appear here. Try another status to see other tickets.</p></div> : <div className="queue-list">{data.tickets.map(ticket => <Link to={`/tickets/${ticket.id}`} key={ticket.id} className="queue-ticket">
          <div><span className={`priority-${ticket.priority.toLowerCase()}`}>{ticket.priority} · {ticket.category}</span><h3>{ticket.title}</h3><p>{ticket.team} · {agents.find(agent => agent.id === ticket.assignee_id)?.email ?? "Unassigned"}</p></div>
          <div className="queue-ticket-status"><span className={`status workflow-${ticket.status}`}>{workflowLabels[ticket.status]}</span><small>{new Date(ticket.created_at).toLocaleDateString()}</small><Icon name="arrow" /></div>
        </Link>)}</div>}
        <div className="queue-pagination"><button className="button-secondary" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.page_size))}</span><button className="button-secondary" disabled={loading || page * data.page_size >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </section>
    {manager && <section className="panel requester-invite"><h2>Invite requesters</h2><p className="muted">Share a signup link with students or employees. They can raise and track their own tickets, without access to support assignment or billing.</p><button disabled={inviteBusy} onClick={() => void generateInvite()}>{inviteBusy ? "Generating…" : "Generate requester signup link"}</button><p className="muted"><small>Generating a new link replaces the previous one. Existing requester accounts keep their access.</small></p>{inviteError && <p className="error" role="alert">{inviteError}</p>}{inviteLink && <label className="field"><span>Copy and share this signup link</span><input readOnly value={inviteLink} onFocus={e => e.target.select()} /><small className="muted">This link grants requester access to your organization. Share it with intended users only.</small></label>}</section>}
    {manager && <details className="panel agent-management"><summary>Add a support agent</summary><p className="muted">Create an account in this workspace. Agents can manage support tickets, but cannot manage billing or add users.</p><form onSubmit={addAgent} className="agent-form"><label className="field"><span>Agent email</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label><label className="field"><span>Password (at least 12 characters)</span><input type="password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label><button disabled={adding}>{adding ? "Creating…" : "Create support account"}</button></form>{agentMessage && <p role="status" className="muted">{agentMessage}</p>}</details>}
  </div>
}
