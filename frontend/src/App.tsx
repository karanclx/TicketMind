import { WorkspaceSettingsPage } from "./pages/WorkspaceSettingsPage"
import { useState } from "react"
import { Navigate, Route, Routes, useNavigate, Link, NavLink } from "react-router-dom"
import { useAuth } from "./auth"
import { Spotlight } from "./components/ui/spotlight"
import { Icon } from "./components/ui/icon"
import { AuthPage } from "./components/AuthPage"
import { MyTicketsPage } from "./pages/MyTicketsPage"
import { SupportQueuePage } from "./pages/SupportQueuePage"
import { TicketDetailPage } from "./pages/TicketDetailPage"
import { TicketSubmitPage } from "./pages/TicketSubmitPage"
import { LoginPage } from "./pages/LoginPage"
import { SignupPage } from "./pages/SignupPage"
import { BillingPage } from "./pages/BillingPage"
import { SuccessPage, CancelPage } from "./pages/CheckoutStatusPages"

const Guard = ({ children, publicOnly = false, roles }: { children: React.ReactNode; publicOnly?: boolean; roles?: string[] }) => {
  const { user, loading } = useAuth()
  if (loading) return <div className="panel loading-state" role="status"><span className="loader" />Loading your workspace…</div>
  if (user && roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return publicOnly ? (!user ? <>{children}</> : <Navigate to="/" replace />) : (user ? <>{children}</> : <Navigate to="/login" replace />)
}

const Home = () => {
  const { user } = useAuth()
  return ["owner", "admin", "agent"].includes(user?.role) ? <Navigate to="/queue" replace /> : <MyTicketsPage />
}

export const App = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [loggingOut, setLoggingOut] = useState(false)
  const handleLogout = async () => {
    setLoggingOut(true)
    try { await logout(); navigate("/login"); setError("") }
    catch { setError("Could not sign out. Please try again.") }
    finally { setLoggingOut(false) }
  }
  return <div className="app-shell">
    <Spotlight />
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header">
      <Link to="/" className="brand" aria-label="TicketMind home"><span className="brand-mark"><Icon name="spark" /></span>TicketMind<span className="brand-tag">{user ? ["owner", "admin", "agent"].includes(user.role) ? "SUPPORT DESK" : "REQUESTER" : "HELPDESK"}</span></Link>
      {user ? <nav aria-label="Main navigation">
        <NavLink to="/new"><Icon name="plus" />Raise a ticket</NavLink>
        <NavLink to="/my-tickets"><Icon name="ticket" />My tickets</NavLink>
        {["owner", "admin", "agent"].includes(user.role) && <NavLink to="/queue"><Icon name="layers" />Support queue</NavLink>}
        {(user.role === "owner" || user.role === "admin") && <NavLink to="/billing"><Icon name="wallet" />Billing</NavLink>}
        {["owner", "admin"].includes(user.role) && <NavLink to="/workspace">Workspace</NavLink>}
        <span className="nav-divider" />
        <button className="button-ghost" onClick={() => void handleLogout()} disabled={loggingOut}><Icon name="logout" /><span>{loggingOut ? "Signing out…" : "Log out"}</span></button>
      </nav> : <span className="header-caption">A little clarity for every support issue.</span>}
    </header>
    <main id="main" className="app-main">
      {error && <p className="error" role="alert">{error}</p>}
      <Routes>
        <Route path="/login" element={<Guard publicOnly><LoginPage /></Guard>} />
        <Route path="/setup" element={<Guard publicOnly><AuthPage signup workspace /></Guard>} />
        <Route path="/my-tickets" element={<Guard><MyTicketsPage /></Guard>} />
        <Route path="/new" element={<Guard><TicketSubmitPage /></Guard>} />
        <Route path="/signup" element={<Guard publicOnly><SignupPage /></Guard>} />
        <Route path="/queue" element={<Guard roles={["owner", "admin", "agent"]}><SupportQueuePage /></Guard>} />
        <Route path="/workspace" element={<Guard roles={["owner", "admin"]}><WorkspaceSettingsPage /></Guard>} />
        <Route path="/billing" element={<Guard roles={["owner", "admin"]}><BillingPage /></Guard>} />
        <Route path="/billing/success" element={<Guard><SuccessPage /></Guard>} />
        <Route path="/billing/cancel" element={<Guard><CancelPage /></Guard>} />
        <Route path="/" element={<Guard><Home /></Guard>} />
        <Route path="/tickets/:id" element={<Guard><TicketDetailPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    <footer className="app-footer"><span>TicketMind <span className="footer-dot">/</span> Support, with a clearer next step.</span><span>Built for better triage <Icon name="spark" width="14" height="14" /></span></footer>
  </div>
}
