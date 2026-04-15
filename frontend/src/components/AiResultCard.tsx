import type { TicketDetail } from "../types"

type AiResultCardProps = {
  ai: TicketDetail["ai"]
}

export const AiResultCard = ({ ai }: AiResultCardProps) => {
  if (!ai) {
    return (
      <section className="panel">
        <h3>AI Result</h3>
        <p>No AI result yet. Processing may still be in progress.</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h3>AI Classification</h3>
      <p>
        <strong>Category:</strong> {ai.result.category}
      </p>
      <p>
        <strong>Priority:</strong> {ai.result.priority}
      </p>
      <p>
        <strong>Summary:</strong> {ai.result.summary}
      </p>
      <p>
        <strong>Root cause:</strong> {ai.result.root_cause}
      </p>
      <p>
        <strong>Resolution:</strong> {ai.result.suggested_resolution}
      </p>
      <p>
        <strong>Confidence:</strong> {ai.result.confidence}
      </p>
      <p>
        <strong>Auto resolve:</strong> {ai.result.auto_resolve ? "Yes" : "No"}
      </p>
    </section>
  )
}
