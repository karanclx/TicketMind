import { Navigate, Route, Routes, useNavigate, Link } from "react"
import { useAuth } from "./auth"

import { TicketDetailPage } from "./pages/TicketDetailPage"
import { TicketSubmitPage } from "./pages/TicketSubmitPage"
import { LoginPage } from "./pages/LoginPage"
import { SignupPage } from "./pages/SignupPage"
import { BillingPage } from "./pages/BillingPage"
import { SuccessPage, CancelPage } from "./pages/CheckoutStatusPages"

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  return user ? <>{children}</> : <Navigate to="/login" />
}

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  return !user ? <>{children}</> : <Navigate to="/" />
}

export const App = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate("/login")
  }

  return (
    <div className="app-shell">
      <header className="app-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>TicketMind</h1>
          <p>IT support ticket triage</p>
        </div>
        {user && (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {(user.role === "owner" || user.role === "admin") && (
              <Link to="/billing" style={{ color: "white" }}>Billing</Link>
            )}
            <button onClick={handleLogout} className="btn">
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          
          <Route path="/billing" element={<PrivateRoute><BillingPage /></PrivateRoute>} />
          <Route path="/billing/success" element={<PrivateRoute><SuccessPage /></PrivateRoute>} />
          <Route path="/billing/cancel" element={<PrivateRoute><CancelPage /></PrivateRoute>} />
          
          <Route path="/" element={<PrivateRoute><TicketSubmitPage /></PrivateRoute>} />
          <Route path="/tickets/:id" element={<PrivateRoute><TicketDetailPage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
