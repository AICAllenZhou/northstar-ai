import { useEffect, useMemo, useRef, useState } from 'react'
import type { Replan } from '../api/types'
import { fmtNumber } from '../lib/format'
import { prefersReducedMotion } from '../lib/prefs'
import { clock } from '../lib/time'
import { useStore, type RunMoment as Moment } from '../state/store'

// The optimizer's real phases, in the order NorthstarStrategy.plan() runs them
// (backend/northstar/strategies/northstar.py): read state → feasibility table → CP-SAT model → solve → the simulator executes and validates the plan.
const STAGES = [
  'Reading the network state (closures, aircraft, missions)…',
  'Building the feasibility table (runway, range, availability, open routes)…',
  'Building the CP-SAT model (assignments, sequencing, timing, penalties)…',
  'Solving with OR-Tools CP-SAT…',
  'Validating the plan in the simulator…',
]
const STAGE_MS = 350      // one stage per ~350 ms while the request is in flight
const FINISH_MS = 120     // remaining stages after a live solve returns
const LINE_MS = 90        // solver-log replay cadence (visual only; never gates the result)
const LOG_CAP = 12

const badge = (status: string) => (status === 'OPTIMAL' ? 'ns' : status === 'NO_FEASIBLE_SOLUTION' ? 'base' : 'warn')

/** Full-width overlay over the map: truthful stages while the request is in flight, then the real solver log. */
export function RunMoment() {
  const m = useStore((s) => s.runMoment)
  if (!m) return null
  return <MomentCard key={m.seq} m={m} />
}

function MomentCard({ m }: { m: Moment }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const close = useStore((s) => s.closeRunMoment)
  const startRun = useStore((s) => s.startNorthstarRun)
  const policyId = useStore((s) => s.policyId)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(0)   // stages completed after the response arrived
  const [lines, setLines] = useState(0)          // solver-log lines revealed
  const [ready, setReady] = useState(false)
  const timers = useRef<number[]>([])

  const pending = m.status === 'pending'
  const calls = useMemo(() => (m.result?.replans ?? []).filter((r): r is Replan & { solver: NonNullable<Replan['solver']> } => !!r.solver), [m.result])
  const shown = calls.slice(0, LOG_CAP)

  // Live timer while the request is in flight; it freezes at the response, so a cache hit reads as the
  // few milliseconds it really took (the fact line states where the engine actually computed).
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => setElapsed(performance.now() - m.startedAt), 50)
    return () => window.clearInterval(id)
  }, [pending, m.startedAt])
  const shownMs = pending ? elapsed : Math.max(0, (m.respondedAt ?? m.startedAt) - m.startedAt)

  // Stage reached while waiting: one per STAGE_MS, never beyond the last. After the
  // response the frozen waiting stage completes and the rest follow quickly.
  const waitedMs = pending ? elapsed : Math.max(0, (m.respondedAt ?? m.startedAt) - m.startedAt)
  const waitingStage = Math.min(STAGES.length - 1, Math.floor(waitedMs / STAGE_MS))
  const stageDone = pending ? waitingStage : Math.min(STAGES.length, waitingStage + 1 + finished)

  // After the response the result is offered at once: no animation ever holds it back ("no fake waiting").
  // A cache hit computed nothing now, so its stages complete immediately; a live solve lets the last
  // stages tick off briefly. The solver-log replay is a visual and can be clicked through.
  useEffect(() => {
    if (m.status !== 'done') return
    const remaining = STAGES.length - (waitingStage + 1)
    const total = shown.length
    const ts = timers.current
    const instant = reduced || !!m.result?.cached
    // Deferred so no state is set synchronously inside the effect.
    ts.push(window.setTimeout(() => setReady(true), 0))
    if (reduced) {
      ts.push(window.setTimeout(() => { setFinished(remaining); setLines(total) }, 0))
      return () => { ts.forEach((t) => window.clearTimeout(t)); ts.length = 0 }
    }
    if (instant) ts.push(window.setTimeout(() => setFinished(remaining), 0))
    else for (let i = 1; i <= remaining; i++) ts.push(window.setTimeout(() => setFinished(i), i * FINISH_MS))
    const logStart = (instant ? 0 : remaining * FINISH_MS) + 100
    for (let i = 1; i <= total; i++) ts.push(window.setTimeout(() => setLines(i), logStart + i * LINE_MS))
    return () => { ts.forEach((t) => window.clearTimeout(t)); ts.length = 0 }
  }, [m.status, m.result?.cached, reduced, shown.length, waitingStage])

  const r = m.result
  const ms = r ? (r.compute_ms ?? r.solver?.total_wall_ms ?? null) : null
  // One truthful line under the stages, stated once: on a cache hit nothing was recomputed now.
  const fact = !r ? null : r.cached
    ? `This scenario was solved at start-up by the same engine${ms !== null ? ` (${fmtNumber(ms)} ms)` : ''}; nothing is recomputed now.`
    : `Solved${ms !== null ? ` in ${fmtNumber(ms)} ms` : ''} · ${r.solver?.calls ?? calls.length} solver calls`
  const seeResult = () => { close(); m.onDone?.() }
  const secs = (shownMs / 1000).toFixed(2)
  const timerNote = pending ? 'waiting for the engine' : m.status === 'error' ? 'failed' : r?.cached ? 'request · result was already computed' : 'solved live'

  return (
    <div className="run-moment" role="dialog" aria-label="NORTHSTAR is planning" aria-live="polite">
      <div className="rm-card">
        <div className="rm-top">
          <span className="eyebrow">Run NORTHSTAR AI · OR-Tools CP-SAT</span>
          <span className="rm-timer mono" aria-label="elapsed">{secs} s<small>{timerNote}</small></span>
        </div>
        <ol className="rm-stages">
          {STAGES.map((label, i) => {
            const state = i < stageDone ? 'done' : i === stageDone ? 'on' : 'todo'
            return <li key={label} className={state}><span className="rm-dot" aria-hidden />{label}</li>
          })}
        </ol>
        {m.status === 'error' && (
          <div className="demo-error" role="alert">
            <span>NORTHSTAR could not run: {m.error}</span>
            <div className="rm-actions">
              <button type="button" className="btn small" onClick={() => startRun(policyId, m.onDone)}>Retry</button>
              <button type="button" className="btn small ghost" onClick={close}>Close</button>
            </div>
          </div>
        )}
        {r && (
          <div className="rm-result">
            <p className="rm-fact mono">{fact}</p>
            {shown.length > 0 && (
              <>
                <div className="rm-log-head"><span className="eyebrow">Solver log</span><span className="mono muted">{calls.length} calls · {r.solver ? `${(r.solver.total_wall_ms / 1000).toFixed(1)} s solving` : ''}</span></div>
                <ol className="rm-log mono" aria-label="Solver calls">
                  {shown.slice(0, lines).map((c, i) => (
                    <li key={i} className="rm-line">
                      <span className="t">{clock(c.t)}</span>
                      <span>{c.solver.n_missions} missions</span>
                      <span>{c.solver.n_aircraft} aircraft</span>
                      <span className={`chip solid ${badge(c.solver.status)}`}>{c.solver.status}</span>
                      <span className="ms">{fmtNumber(c.solver.wall_ms)} ms</span>
                    </li>
                  ))}
                  {lines >= shown.length && calls.length > shown.length && <li className="rm-more">+{calls.length - shown.length} more</li>}
                </ol>
              </>
            )}
            {shown.length === 0 && lines === 0 && <p className="muted rm-none">No optimization call was needed: the schedule could fly as published.</p>}
            <div className={`rm-foot ${ready ? 'show' : ''}`}>
              <span className="rm-status">{r.status === 'OK' ? 'Plan ready' : r.status}</span>
              <button type="button" className="btn accent big" onClick={seeResult} disabled={!ready}>See the result ▸</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
