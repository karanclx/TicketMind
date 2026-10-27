import { useEffect, useState } from "react"
import { getSupportAgents, updateHandoff } from "../api"
import { useAuth } from "../auth"
import type { HandoffUpdate, SupportAgent, TicketDetail, WorkflowStatus } from "../types"
import { Icon } from "./ui/icon"

export const workflowLabels: Record<WorkflowStatus, string> = {
  awaiting_ai: "Awaiting analysis", awaiting_confirmation: "Awaiting your confirmation",
  needs_human: "Waiting for support", in_progress: "Support in progress", resolved: "Resolved"
}
export function HandoffPanel({ ticket, onUpdate }: { ticket: TicketDetail; onUpdate: () => Promise<void> }) {
  const { user } = useAuth()
  const staff = ["owner", "admin", "agent"].includes(user?.role)
  const requester = ticket.created_by === user?._id
  const workflow = ticket.workflow
  const [agents, setAgents] = useState<SupportAgent[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [team, setTeam] = useState(workflow?.team ?? "IT Helpdesk")
  const [assignee, setAssignee] = useState(workflow?.assignee_id ?? "")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (staff) getSupportAgents().then(data => { setAgents(data.agents); setTeams(data.teams) }).catch(err => setError(err instanceof Error ? err.message : "Could not load support staff"))
  }, [staff])
  useEffect(() => { setTeam(workflow?.team ?? "IT Helpdesk"); setAssignee(workflow?.assignee_id ?? "") }, [workflow?.revision, workflow?.team, workflow?.assignee_id])
  // A backend restart may be needed immediately after upgrading the frontend.
  if (!workflow) return <section className="panel"><h2>Human support</h2><p className="muted">Restart the updated backend to enable ticket handoffs.</p></section>
  const human = ["needs_human", "in_progress"].includes(workflow.status)
  const canAct = staff || requester
  async function act(action: HandoffUpdate["action"]) {
    setBusy(true); setError("")
    try {
      await updateHandoff(ticket.id, {
        action, expected_revision: workflow.revision, note,
        ...(action === "assign" ? { team, assignee_id: assignee || null } : {})
      })
      setNote(""); await onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update ticket")
      await onUpdate()
    } finally { setBusy(false) }
  }
  return <section className="panel handoff-panel">
    <div className="row row-space"><div className="row"><span className="icon-tile"><Icon name="shield" /></span><div><div className="eyebrow">AI + YOUR SUPPORT TEAM</div><h2>{staff ? "Resolution & handoff" : "Your request status"}</h2></div></div><span className={`status workflow-${workflow.status}`}>{workflowLabels[workflow.status]}</span></div>
    <p className="muted">{workflow.reason || "AI analysis is a suggestion. The issue stays open until someone confirms a resolution."}</p>
    {human && <div className="handoff-assignment"><span><strong>Support team:</strong> {workflow.team}</span>{staff && <span><strong>Assigned to:</strong> {agents.find(agent => agent.id === workflow.assignee_id)?.email ?? (workflow.assignee_id ? "Support team member" : "Unassigned — ready to be claimed")}</span>}</div>}
    {workflow.status === "resolved" && <div className="resolution-note"><strong>Resolution note</strong><p>{workflow.resolution_note}</p>{workflow.resolved_at && <small>Resolved {new Date(workflow.resolved_at).toLocaleString()}</small>}</div>}
    {!staff && human && <p className="muted">Your support team will review this request. You don’t need to assign an agent or take ownership.</p>}
    {canAct && (staff || !human) && <>
      {staff && workflow.status !== "resolved" && <div className="assignment-fields">
        <label className="field"><span>Support team</span><select value={team} onChange={e => setTeam(e.target.value)} disabled={busy || teams.length === 0}>{teams.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Support agent</span><select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={busy}><option value="">Unassigned (team queue)</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.email}</option>)}</select></label>
        <button className="button-secondary" disabled={busy || !teams.length} onClick={() => void act("assign")}>Save assignment</button>
      </div>}
      <label className="field"><span>{human && staff ? "Resolution note (required to resolve)" : "Note (optional)"}</span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={3} placeholder="Describe what worked, what you tried, or what help is needed." disabled={busy} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="handoff-actions">
        {workflow.status === "awaiting_confirmation" && <button disabled={busy} onClick={() => void act("confirm_fixed")}><Icon name="check" />This solved it</button>}
        {["awaiting_ai", "awaiting_confirmation"].includes(workflow.status) && <button className="button-secondary" disabled={busy} onClick={() => void act("request_human")}>I still need help</button>}
        {staff && human && <>
          {workflow.status !== "in_progress" && <button className="button-secondary" disabled={busy || Boolean(workflow.assignee_id && workflow.assignee_id !== user?._id)} onClick={() => void act("start")}>Claim & start work</button>}
          <button disabled={busy || !note.trim()} onClick={() => void act("resolve")}><Icon name="check" />Mark resolved</button>
        </>}
        {workflow.status === "resolved" && <button className="button-secondary" disabled={busy} onClick={() => void act("reopen")}>Reopen ticket</button>}
        {busy && <span role="status" className="muted">Saving…</span>}
      </div>
    </>}
  </section>
}
