import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../auth"
import { Icon } from "./ui/icon"

export function AuthPage({ signup = false, workspace = false }: { signup?: boolean; workspace?: boolean }) {
  const auth = useAuth()
  const [params] = useSearchParams()
  const [invite, setInvite] = useState(params.get("invite") ?? "")
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [organizationName, setOrganizationName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      if (signup) await auth.signup(workspace ? { email, password, organizationName, accountType: "workspace" } : { email, password, invite })
      else await auth.login({ email, password })
      navigate("/")
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Please try again.") }
    finally { setBusy(false) }
  }
  return <div className="auth-layout page-enter">
    <section className="auth-story">
      <div className="eyebrow"><span className="accent-dot" /> A CLEARER WAY TO HANDLE IT</div>
      <h1>Small issues.<br />Big interruptions.<br /><span className="text-gradient">Let’s sort them out.</span></h1>
      <p>Your workspace for understanding support requests,<br />setting priorities, and finding the next step.</p>
      <div className="auth-orbit" aria-hidden="true"><div className="orbit-ring" /><div className="orbit-ring inner" /><span className="orbit-center"><Icon name="spark" width="40" height="40" /></span><span className="orbit-label orbit-one"><Icon name="ticket" />Issue reported</span><span className="orbit-label orbit-two"><Icon name="check" />Clarity delivered</span></div>
      <div className="auth-caption"><Icon name="layers" /> ONE WORKSPACE. A CLEARER PICTURE.</div>
    </section>
    <section className="panel auth-panel">
      <span className="icon-tile"><Icon name="spark" /></span>
      <h2>{signup ? workspace ? "Set up your helpdesk." : "Create a requester account." : "Welcome back."}</h2>
      <p>{signup ? workspace ? "For administrators: create a workspace to manage support for your organization." : "Join your organization to raise tickets and track your requests. Your support team handles the rest." : "Sign in to raise a request or manage support. Your account determines your access."}</p>
      <form onSubmit={submit}>
        {signup && workspace && <label className="field"><span>Workspace name</span><input required autoComplete="organization" maxLength={120} value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="e.g. Customer Support" /></label>}
        {signup && !workspace && <label className="field"><span>Requester signup code</span><input required value={invite} onChange={e => setInvite(e.target.value.trim())} placeholder="Provided by your organization or support team" autoComplete="off" /><small className="muted">Ask your helpdesk for its signup link or code.</small></label>}
        <label className="field"><span>Email address</span><input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@college.edu" /></label>
        <label className="field"><span>Password</span><input required type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder={signup ? "At least 8 characters" : "Enter your password"} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button-primary glow-button full-width" disabled={busy}>{busy ? "Please wait…" : signup ? workspace ? "Create administrator workspace" : "Create requester account" : "Sign in"}<Icon name="arrow" /></button>
      </form>
      <div className="auth-switch">{signup ? "Already have an account?" : "New to TicketMind?"} <Link to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create requester account"}</Link></div>
      {!workspace && <p className="auth-admin-link">Setting up support for an organization? <Link to="/setup">Administrator setup</Link></p>}
      {workspace && <p className="auth-admin-link">Just need to report an issue? <Link to="/signup">Join as a requester</Link></p>}
    </section>
  </div>
}
