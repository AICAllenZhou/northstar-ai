import { useEffect, useRef, useState } from 'react'
import type { DecisionAlternative, DecisionRecord, NetworkResponse, RunResult } from '../api/types'
import { snapshotAt } from '../lib/derive'
import { reasonText } from '../lib/format'
import { altCounts, missionShort, pickDecision, reasonChecklist, vsBaselineText } from '../lib/humanize'
import { clock, duration, signedDuration } from '../lib/time'
import { useStore } from '../state/store'

/** One decision, explained as a checklist rendered from the optimizer's reason codes. */
export function WhyCard({ decision, variant = 'panel' }: { decision: DecisionRecord; variant?: 'panel' | 'in-demo' }) {
  const network = useStore((s) => s.network)
  const nsRun = useStore((s) => s.runs.northstar)
  const releaseMin = useStore((s) => s.scenario?.missions.find((m) => m.id === decision.mission_id)?.release_min ?? null)
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
          {open && <AlternativesTable decision={decision} network={network} run={nsRun} releaseMin={releaseMin} />}
        </div>
      )}
      {vs && <p className="why-vs">{vs}</p>}
      {trade && <p className="why-trade">Trade-off: {trade.text}{trade.delta_min !== null && <span className="delta bad"> ({signedDuration(trade.delta_min)})</span>}</p>}
      <p className="why-foot mono">Generated from the optimizer’s feasibility table and solution. No language model.</p>
    </div>
  )
}

/** The text after "AC-01 (type): " in an alternative's sentence; falls back to the reason code or the whole text. */
function altReason(a: DecisionAlternative): string {
  const m = a.text.match(/^[A-Z]+-\d+\s*\([^)]*\):\s*(.+)$/)
  if (m) return m[1]
  return a.reason_code ? reasonText(a.reason_code) : a.text
}

type CandidateRow = { id: string; type: string; verdict: string; reason: string; repos: number | null; chosen?: boolean }

/** Every aircraft in the fleet at the moment of the decision: the chosen one, each alternative with the optimizer's
 *  reason, and the aircraft that were not candidates at all (unserviceable or stranded at a closed airport, from the
 *  NORTHSTAR run's snapshot at the decision time). Nothing here is inferred beyond those fields. */
function AlternativesTable({ decision, network, run, releaseMin }: { decision: DecisionRecord; network: NetworkResponse | null; run: RunResult | undefined; releaseMin: number | null }) {
  const t = decision.decided_at_min
  const snap = t !== null ? snapshotAt(run, t) : null
  const typeOf = (id: string) => network?.aircraft.find((a) => a.id === id)?.type ?? ''
  const rows: CandidateRow[] = []
  // response_min is a clock time; the duration after the request comes from the record (or the mission's release).
  const after = decision.response_after_request_min ?? (decision.response_min !== null && releaseMin !== null ? decision.response_min - releaseMin : null)
  const chosenText = after !== null ? `chosen · response ${duration(after)} after request (pick-up ${clock(decision.response_min)})` : 'chosen'
  if (decision.aircraft_id) rows.push({ id: decision.aircraft_id, type: decision.aircraft_type ?? typeOf(decision.aircraft_id), verdict: 'chosen', reason: chosenText, repos: null, chosen: true })
  for (const a of decision.alternatives) rows.push({ id: a.aircraft_id, type: typeOf(a.aircraft_id), verdict: a.verdict, reason: altReason(a), repos: a.reposition_min })
  const listed = new Set(rows.map((r) => r.id))
  for (const ac of network?.aircraft ?? []) {
    if (listed.has(ac.id)) continue
    const st = snap?.aircraft.find((x) => x.id === ac.id)?.status
    const reason = st === 'failed' ? 'unserviceable at the time, not a candidate' : st === 'stranded' ? 'on the ground at a closed airport, not a candidate' : 'not in the feasibility table at the time'
    rows.push({ id: ac.id, type: ac.type, verdict: st === 'failed' || st === 'stranded' ? st : 'absent', reason, repos: null })
  }
  const fleet = network?.aircraft.length ?? rows.length
  return (
    <div className="alts-wrap">
      <table className="alts-table" aria-label="Every candidate aircraft">
        <thead><tr><th>Aircraft</th><th>Verdict</th><th>Reason</th><th className="num">Reposition</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.chosen ? 'chosen' : ''}>
              <td><span className="mono">{r.id}</span>{r.type && <span className="alt-type">{r.type}</span>}</td>
              <td><span className={`chip verdict-${r.verdict}`}>{r.verdict}</span></td>
              <td className="alt-reason">{r.reason}</td>
              <td className="num mono">{r.repos === null ? '—' : r.repos === 0 ? 'on site' : duration(r.repos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="alts-foot mono">{rows.length} of {fleet} aircraft{t !== null ? ` · decided at ${clock(t)}` : ''} · verdicts and reasons are the optimizer's own fields</p>
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
