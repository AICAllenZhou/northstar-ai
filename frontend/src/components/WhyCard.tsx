import { useEffect, useRef, useState } from 'react'
import type { DecisionRecord } from '../api/types'
import { altCounts, missionShort, pickDecision, reasonChecklist, vsBaselineText } from '../lib/humanize'
import { signedDuration } from '../lib/time'
import { useStore } from '../state/store'

/** One decision, explained as a checklist rendered from the optimizer's reason codes. */
export function WhyCard({ decision, variant = 'panel' }: { decision: DecisionRecord; variant?: 'panel' | 'in-demo' }) {
  const network = useStore((s) => s.network)
  const [open, setOpen] = useState(false)
  const items = reasonChecklist(decision, network)
  const alts = altCounts(decision)
  const vs = vsBaselineText(decision)
  const trade = decision.tradeoffs[0]
  const unserved = decision.status === 'unserved'
  return (
    <div className={`why-card ${variant} ${unserved ? 'unserved' : ''}`}>
      <h3 className="why-head">
        {unserved ? <>Why {missionShort(decision, network)} was not served</>
          : <>Why {decision.aircraft_id}{decision.aircraft_type ? ` (${decision.aircraft_type})` : ''} for {missionShort(decision, network)}</>}
      </h3>
      <ul className="why-list">
        {items.map((it, i) => (
          <li key={i} className={it.ok ? 'ok' : 'no'}>
            <span className="tick" aria-hidden>{it.ok ? '✓' : '✕'}</span>
            <span>{it.text}{it.note && <span className="why-note"> — {it.note}</span>}</span>
          </li>
        ))}
      </ul>
      {alts.n > 0 && (
        <div className="why-alts">
          <button type="button" className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="caret">{open ? '▾' : '▸'}</span> Alternatives considered: {alts.n} — {alts.rejected} infeasible, {alts.busy} busy, {alts.worse} slower
          </button>
          {open && (
            <ul className="alts">
              {decision.alternatives.map((a) => <li key={a.aircraft_id}><span className={`chip verdict-${a.verdict}`}>{a.verdict}</span><span>{a.text}</span></li>)}
            </ul>
          )}
        </div>
      )}
      {vs && <p className="why-vs">{vs}</p>}
      {trade && <p className="why-trade">Trade-off: {trade.text}{trade.delta_min !== null && <span className="delta bad"> ({signedDuration(trade.delta_min)})</span>}</p>}
      <p className="why-foot mono">Generated from the optimizer’s feasibility table and solution. No language model.</p>
    </div>
  )
}

/** Simple-mode summary: the top decision, with a link to the full list in Advanced mode. */
export function WhyPanel() {
  const decisions = useStore((s) => s.decisions)
  const ns = useStore((s) => s.runs.northstar)
  const expanded = useStore((s) => s.expandedDecision)
  const setAdvanced = useStore((s) => s.setAdvanced)
  const focusPanel = useStore((s) => s.focusPanel)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const highlightDecision = useStore((s) => s.highlightDecision)
  const ref = useRef<HTMLElement>(null)
  const d = decisions.find((x) => x.mission_id === expanded) ?? pickDecision(decisions)

  useEffect(() => {
    if (focusPanel !== 'why' || !ref.current) return
    const el = ref.current
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('flash')
    const id = setTimeout(() => { el.classList.remove('flash'); setFocusPanel(null) }, 1800)
    return () => clearTimeout(id)
  }, [focusPanel, setFocusPanel])

  if (!ns || !d) return null
  return (
    <section className="panel why-panel" ref={ref}>
      <div className="panel-title">
        <span className="eyebrow">Why this decision</span>
        <button type="button" className="btn small ghost" onClick={() => highlightDecision(d)} title="Show the chosen path on the map">Show on map</button>
      </div>
      <WhyCard decision={d} />
      <div className="why-more">
        <button type="button" className="link" onClick={() => { setAdvanced(true); setFocusPanel('decisions') }}>See all {decisions.length} decisions</button>
      </div>
    </section>
  )
}
