import { useEffect, useRef } from 'react'
import type { DecisionRecord } from '../api/types'
import { airportName } from '../lib/derive'
import { reasonText } from '../lib/format'
import { clock, duration, signedDuration } from '../lib/time'
import { useStore } from '../state/store'
import { TypeChip } from './ui'

export function DecisionsPanel() {
  const decisions = useStore((s) => s.decisions)
  const ns = useStore((s) => s.runs.northstar)
  const expanded = useStore((s) => s.expandedDecision)
  const setExpanded = useStore((s) => s.setExpandedDecision)
  const highlightDecision = useStore((s) => s.highlightDecision)
  const focusPanel = useStore((s) => s.focusPanel)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const network = useStore((s) => s.network)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (focusPanel !== 'decisions' || !ref.current) return
    const el = ref.current
    const target = el.querySelector<HTMLElement>('.decision.open') ?? el
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('flash')
    const id = setTimeout(() => { el.classList.remove('flash'); setFocusPanel(null) }, 1800)
    return () => clearTimeout(id)
  }, [focusPanel, setFocusPanel, expanded])

  const toggle = (d: DecisionRecord) => {
    if (expanded === d.mission_id) { setExpanded(null); highlightDecision(null) } else highlightDecision(d)
  }

  return (
    <section className="panel decisions" ref={ref}>
      <div className="panel-title">
        <span className="eyebrow">NORTHSTAR decisions <span className="count">{decisions.length}</span></span>
        <span className="eyebrow src">structured, no LLM</span>
      </div>
      {!ns && <div className="empty">Run <strong>NORTHSTAR AI</strong> to see each assignment, the alternatives it rejected and the trade-offs.</div>}
      {ns && decisions.length === 0 && <div className="empty">NORTHSTAR kept the published schedule: no medevac, cargo or rerouted flight to explain.</div>}
      <ul className="decision-list">
        {decisions.map((d) => {
          const open = expanded === d.mission_id
          const unserved = d.status === 'unserved'
          const why = d.reasons.find((r) => r.code === 'UNSERVED_BECAUSE')
          return (
            <li key={d.mission_id} className={`decision type-${d.mission_type} ${open ? 'open' : ''} ${unserved ? 'unserved' : ''}`}>
              <button className="decision-head" onClick={() => toggle(d)} aria-expanded={open}>
                <span className="caret">{open ? '▾' : '▸'}</span>
                <span className="mono">{d.mission_id}</span>
                <TypeChip type={d.mission_type} />
                {d.mission_type === 'medical' && <span className="chip med">P{d.priority}</span>}
                <span className={`chip ${unserved ? 'solid danger' : 'ns'}`}>{unserved ? 'unserved' : d.aircraft_id}</span>
                <span className="decision-summary">{unserved ? `${d.label}: not served — ${why?.text ?? reasonText(String(d.reasons[0]?.data?.reason ?? ''))}` : d.summary}</span>
              </button>
              {open && (
                <div className="decision-body">
                  <div className="decision-facts mono">
                    {d.path && <span>{d.path.map((p) => airportName(network, p)).join(' → ')}</span>}
                    {d.depart_min !== null && <span>dep {clock(d.depart_min)}</span>}
                    {d.response_min !== null && <span>resp {clock(d.response_min)}</span>}
                    {d.complete_min !== null && <span>done {clock(d.complete_min)}</span>}
                    {d.decided_at_min !== null && <span>decided {clock(d.decided_at_min)}</span>}
                  </div>
                  <h5>Why</h5>
                  <ul className="reasons">{d.reasons.map((r, i) => <li key={i}><span className="code">{r.code}</span>{r.text}</li>)}</ul>
                  {d.alternatives.length > 0 && (
                    <>
                      <h5>Alternatives considered</h5>
                      <ul className="alts">
                        {d.alternatives.map((a) => (
                          <li key={a.aircraft_id}>
                            <span className={`chip verdict-${a.verdict}`}>{a.verdict}</span>
                            <span>{a.text}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {d.vs_baseline && (
                    <div className="vs-base">
                      <h5>Versus baseline</h5>
                      <span>Baseline used <span className="mono">{d.vs_baseline.baseline_aircraft_id ?? '—'}</span> ({d.vs_baseline.baseline_status ?? 'n/a'}); {d.vs_baseline.metric === 'response_min' ? 'response' : 'completion'} {duration(d.vs_baseline.baseline_value)} → {duration(d.vs_baseline.northstar_value)}
                        {d.vs_baseline.delta_min !== null && <span className={`delta ${d.vs_baseline.delta_min < 0 ? 'good' : d.vs_baseline.delta_min > 0 ? 'bad' : ''}`}> ({signedDuration(d.vs_baseline.delta_min)})</span>}
                      </span>
                    </div>
                  )}
                  <h5>Trade-offs</h5>
                  {d.tradeoffs.length === 0 ? <div className="muted">None: no other mission was delayed to make this assignment.</div>
                    : <ul className="reasons">{d.tradeoffs.map((t) => <li key={t.mission_id}><span className="code">{t.mission_id}</span>{t.text}{t.delta_min !== null && <span className="delta bad"> ({signedDuration(t.delta_min)})</span>}</li>)}</ul>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
