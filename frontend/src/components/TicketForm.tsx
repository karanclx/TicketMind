import { useState } from "react"

import type { TicketRequest } from "../types"

type TicketFormProps = {
  onSubmit: (payload: TicketRequest) => Promise<void>
}

export const TicketForm = ({ onSubmit }: TicketFormProps) => {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [userRole, setUserRole] = useState<TicketRequest["user_role"]>("employee")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        title,
        description,
        user_role: userRole,
        timestamp: new Date().toISOString()
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit ticket")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Submit a ticket</h2>

      <label className="field">
        <span>Title</span>
        <input
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Short issue summary"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          required
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Include symptoms, errors, and impact"
          rows={7}
        />
      </label>

      <label className="field">
        <span>User role</span>
        <select value={userRole} onChange={(event) => setUserRole(event.target.value as TicketRequest["user_role"])}>
          <option value="student">student</option>
          <option value="employee">employee</option>
          <option value="admin">admin</option>
        </select>
      </label>

      {error ? <p className="error">{error}</p> : null}

      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Submitting..." : "Submit Ticket"}
      </button>
    </form>
  )
}
