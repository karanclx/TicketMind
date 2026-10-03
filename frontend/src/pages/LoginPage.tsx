import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "../auth"

export const LoginPage = () => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
      navigate("/")
    } catch (err: any) {
      setError(err.message || "Login failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container">
      <h1>Login to TicketMind</h1>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit} className="ticket-form">
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        Don't have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  )
}
