import type { TicketDetail } from "../types"
import { Icon } from "./ui/icon"

type AiResultCardProps = { ai: TicketDetail["ai"] }
export const AiResultCard = ({ ai }: AiResultCardProps) => {
  if (!ai) return <section className="panel analysis-empty"><span className="icon-tile"><Icon name="spark" /></span><h2>Your analysis will appear here</h2><p>Once processing completes, you’ll see a category, priority, and suggested next steps.</p></section>
  const { result } = ai
  const source = ai.provider === "mock" ? "Demo mock · no AI model" : ai.provider === "deterministic-fallback" ? "Rule-based fallback" : `${ai.provider} / ${ai.model}`
  const steps = result.suggested_resolution.split(/(?:^|\s)\d+[.)]\s+/).map(s => s.trim()).filter(Boolean)
  const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100)
  return <section className="analysis-section">
    <div className="section-heading"><div className="row"><span className="icon-tile"><Icon name="spark" /></span><div><div className="eyebrow">A CLEARER PICTURE</div><h2>Ticket analysis</h2></div></div><span className="source-tag">{source}</span></div>
    <div className="analysis-metrics">
      <div className="panel metric"><span>Category</span><strong><Icon name="layers" />{result.category}</strong></div>
      <div className="panel metric"><span>Priority</span><strong className={`priority-${result.priority.toLowerCase()}`}><span className="priority-dot" />{result.priority}</strong></div>
      <div className="panel metric"><span>Confidence estimate</span><strong>{confidence}<small>%</small></strong><div className="confidence-track" aria-hidden="true"><i style={{ width: `${confidence}%` }} /></div><small>Model estimate, not verified accuracy</small></div>
    </div>
    <div className="analysis-layout">
      <div className="stack">
        <section className="panel"><div className="eyebrow">THE OVERVIEW</div><h3>What’s happening</h3><p className="reading-text">{result.summary}</p></section>
        <section className="panel"><div className="eyebrow">POSSIBLE EXPLANATION</div><h3>Suspected root cause</h3><p className="reading-text">{result.root_cause}</p></section>
        <div className="tip"><Icon name="shield" /><p><strong>{result.auto_resolve ? "Potentially suitable for self-service." : "Human review recommended."}</strong> Confirm the cause before taking action. Network or system changes should be handled by authorized IT staff.</p></div>
      </div>
      <section className="panel resolution-panel"><div className="row row-space"><div><div className="eyebrow">YOUR NEXT STEPS</div><h3>Suggested resolution</h3></div><Icon name="arrow" /></div>
        {steps.length > 1 ? <ol className="resolution-list">{steps.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol> : <p className="reading-text">{result.suggested_resolution}</p>}
      </section>
    </div>
  </section>
}
