import { useNavigate } from "react-router-dom"
import { createTicket } from "../api"
import { TicketForm } from "../components/TicketForm"
import { BentoGrid, BentoGridItem } from "../components/ui/bento-grid"
import { Icon } from "../components/ui/icon"
import type { TicketRequest } from "../types"

export const TicketSubmitPage = () => {
  const navigate = useNavigate()
  const handleSubmit = async (payload: TicketRequest) => {
    const created = await createTicket(payload)
    navigate(`/tickets/${created.id}`)
  }
  return <div className="page-enter">
    <section className="page-heading">
      <div className="eyebrow"><span className="accent-dot" /> RAISE A SUPPORT REQUEST</div>
      <h1>Something not working?<br /><span className="text-gradient">Let’s get you help.</span></h1>
      <p>Tell us what’s happening. Get suggested steps from AI,<br className="desktop-break" /> or let your support team take it from here.</p>
    </section>
    <div className="submit-layout">
      <TicketForm onSubmit={handleSubmit} />
      <aside className="guidance">
        <div className="workflow-card">
          <div className="eyebrow">FROM ISSUE TO INSIGHT</div>
          <h2>A little context.<br />A clearer resolution.</h2>
          <ol className="workflow-list">
            <li><span>01</span><div><h3>Describe the issue</h3><p>Tell us what happened and who’s affected.</p></div></li>
            <li><span>02</span><div><h3>Find the signal</h3><p>Get a category, priority, and a concise summary.</p></div></li>
            <li><span>03</span><div><h3>Take the next step</h3><p>Review suggested actions with your support team.</p></div></li>
          </ol>
          <div className="workflow-visual" aria-hidden="true"><span><Icon name="ticket" /></span><i /><span className="brain-node"><Icon name="spark" /></span><i /><span><Icon name="check" /></span></div>
        </div>
        <div className="tip"><Icon name="shield" /><p><strong>A helpful starting point.</strong> Suggestions support your support team’s judgment. Never include passwords or private credentials.</p></div>
      </aside>
    </div>
    <BentoGrid>
      <BentoGridItem icon={<Icon name="layers" />} title="Context, organized" description="The details that matter, distilled into a readable summary." />
      <BentoGridItem icon={<Icon name="spark" />} title="A suggested way forward" description="Practical next steps tailored to your ticket." />
      <BentoGridItem icon={<Icon name="shield" />} title="A fallback you can rely on" description="Support review keeps requests moving when AI is unavailable." />
    </BentoGrid>
  </div>
}
