import type { TicketDetail } from "../types"

const labels = { disabled: "Screening disabled by workspace", pending: "Screening pending", low_signal: "Low synthetic signal", inconclusive: "Inconclusive — review needed", review_required: "Synthetic signal — review needed", unavailable: "Screening unavailable — review needed" }
export function EvidencePanel({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.images?.length) return null
  return <section className="panel evidence-panel">
    <div className="eyebrow">IMAGE EVIDENCE</div>
    <h2>Evidence screening</h2>
    <p>Automated screening can make mistakes. A low score does not verify authenticity, and a high score does not prove fraud. No refund decisions are made here.</p>
    <div className="evidence-grid">{ticket.images.map(image => <article className="evidence-card" key={image.id}>
      <a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open ${image.name}`}><img src={image.url} alt={image.name} loading="lazy" /></a>
      <strong>{image.name}</strong>
      <span className={`evidence-status evidence-${image.status}`} role="status">{labels[image.status]}</span>
      {image.score !== null && <span>Detector score: {image.score.toFixed(3)} / 1 <small>(not a fraud probability)</small></span>}
      {image.model && <small>Model: {image.model}</small>}
      {image.checked_at && <small>Checked: {new Date(image.checked_at).toLocaleString()}</small>}
      {image.status === "unavailable" && <small>Support can reprocess this ticket once Sightengine access or quota is available.</small>}
    </article>)}</div>
  </section>
}
