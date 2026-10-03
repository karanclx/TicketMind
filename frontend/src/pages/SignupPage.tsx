import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "../auth"

export const SignupPage = () => {
  const [organizationName, setOrganizationName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signup({ organizationName, email, password })
      navigate("/")
    } catch (err: any) {
      setError(err.message || "Signup failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container">
      <h1>Sign Up for TicketMind</h1>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit} className="ticket-form">
        <div className="form-group">
          <label htmlFor="organizationName">Organization Name</label>
          <input
            id="organizationName"
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password (min 8 chars)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="form-control"
          />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? "Signing up..." : "Sign Up"}
        </button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  )
}
