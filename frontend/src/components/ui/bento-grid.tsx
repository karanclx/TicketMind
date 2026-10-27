import type { ReactNode } from "react"

// Aceternity UI Bento Grid, adapted to this project's plain CSS and content sizing.
// https://ui.aceternity.com/components/bento-grid — Manu Arora / Aceternity UI.
export function BentoGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bento-grid ${className}`}>{children}</div>
}

export function BentoGridItem({ title, description, header, icon, className = "" }: {
  title: ReactNode; description?: ReactNode; header?: ReactNode; icon?: ReactNode; className?: string
}) {
  return <section className={`bento-item ${className}`}>
    {header}
    <div className="bento-content">{icon}<h3>{title}</h3><div className="muted">{description}</div></div>
  </section>
}
