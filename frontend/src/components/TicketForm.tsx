import { useState } from "react"
import { Icon } from "./ui/icon"

import type { TicketRequest } from "../types"

type TicketFormProps = {
  onSubmit: (payload: TicketRequest) => Promise<void>
}

export const TicketForm = ({ onSubmit }: TicketFormProps) => {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [userRole, setUserRole] = useState<TicketRequest["user_role"]>("student")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
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
    <form className="panel ticket-form" onSubmit={handleSubmit}>
      <div className="form-heading"><span className="icon-tile"><Icon name="ticket" /></span><div><h2>Create a ticket</h2><p>Let’s get to the root of it.</p></div><span className="small-label">NEW REQUEST</span></div>

      <label className="field">
        <span>Issue title <span className="required">*</span></span>
        <input
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Unable to connect to campus Wi-Fi"
        />
      </label>

      <label className="field">
        <span>What’s happening? <span className="required">*</span></span>
        <textarea
          required
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the problem, any error messages, and who’s affected. What have you already tried?"
          rows={6}
        />
      </label>

      <label className="field">
        <span>Who is reporting the issue?</span>
        <select value={userRole} onChange={(event) => setUserRole(event.target.value as TicketRequest["user_role"])}>
          <option value="student">Student</option>
          <option value="employee">Employee</option>
          <option value="admin">Administrator</option>
        </select>
      </label>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="form-footer"><span><Icon name="shield" width="14" height="14" /> Shared within your workspace</span><button className="button-primary glow-button" disabled={isSubmitting || !title.trim() || !description.trim()} type="submit">
        {isSubmitting ? "Submitting…" : "Analyze ticket"}<Icon name="arrow" />
      </button></div>
    </form>
  )
}
