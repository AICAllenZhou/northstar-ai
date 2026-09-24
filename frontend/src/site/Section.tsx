import type { ReactNode } from 'react'

/** A landing section: briefing eyebrow (SITUATION, METHOD, …), display title, optional lead. */
export function Section({ id, eyebrow, title, lead, children, className = '' }: {
  id: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode; className?: string
}) {
  return (
    <section id={id} className={`sec ${className}`} aria-labelledby={`${id}-h`}>
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow-brief">{eyebrow}</p>
          <h2 id={`${id}-h`}>{title}</h2>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}
