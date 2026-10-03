import { useState } from "react"
import { useAuth } from "../auth"

export const BillingPage = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async (plan: "starter" | "growth") => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      })
      if (!res.ok) throw new Error("Failed to start checkout")
      const { url } = await res.json()
      window.location.href = url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handlePortal = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/billing/portal-session")
      if (!res.ok) throw new Error("Failed to open billing portal")
      const { url } = await res.json()
      window.location.href = url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (!user || !user.organizationId) {
    return <div>Loading...</div>
  }

  const org = user.organizationId // Assuming populate brings it in, or we just rely on data. 
  // Wait, the API GET /auth/me populates organizationId so user.organizationId is the object.

  return (
    <div className="container">
      <h1>Billing & Subscription</h1>
      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <h2>Current Plan: {org.plan || "trial"}</h2>
        <p>Status: {org.subscriptionStatus}</p>
        <p>
          Usage this cycle: {org.ticketsProcessedThisCycle || 0} / {org.monthlyTicketQuota} tickets
        </p>
      </div>

      <div style={{ marginTop: "2rem" }}>
        {org.stripeSubscriptionId ? (
          <button onClick={handlePortal} disabled={loading} className="btn btn-primary">
            Manage Subscription
          </button>
        ) : (
          <div style={{ display: "flex", gap: "1rem" }}>
            <button onClick={() => handleCheckout("starter")} disabled={loading} className="btn btn-primary">
              Upgrade to Starter
            </button>
            <button onClick={() => handleCheckout("growth")} disabled={loading} className="btn btn-primary">
              Upgrade to Growth
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
