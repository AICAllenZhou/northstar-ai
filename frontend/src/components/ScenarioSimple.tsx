import { useEffect, useState } from 'react'
import type { Mission } from '../api/types'
import { describeDisruption, describeMission, experimentSentence, firstSentence, generatedScenario, MISSION_TYPES, presetTitle, scenarioBlurb } from '../lib/humanize'
import { reasonText } from '../lib/format'
import { clock } from '../lib/time'
import { selectControlsDisabled, selectDisplayedRun, selectHasDisruptions, useStore } from '../state/store'
import { PresetCards } from './PresetCards'
import { Spinner } from './ui'

/** Simple-mode left column, part 1: which scenario (cards when healthy, a compact card once loaded). */
export function ScenarioSimple() {
  const presets = useStore((s) => s.presets)
  const scenario = useStore((s) => s.scenario)
  const hasDisruptions = useStore(selectHasDisruptions)
  const resetScenario = useStore((s) => s.resetScenario)
  const busy = useStore((s) => s.busy)
  const disabled = useStore(selectControlsDisabled)
  const [changing, setChanging] = useState(false)
  const sc = scenario?.scenario
  const preset = presets.find((p) => p.id === sc?.id)
  const showCards = !hasDisruptions || changing
  // A generated experiment scenario (opened from the Research page) says which row of the experiment it is;
  // that needs the summary, which the Research page may not have loaded yet in this session.
  const generated = !!generatedScenario(sc?.id)
  const experiments = useStore((s) => s.experiments)
  const experimentsMissing = useStore((s) => s.experimentsMissing)
  const experimentsError = useStore((s) => s.experimentsError)
  const loadExperiments = useStore((s) => s.loadExperiments)
  useEffect(() => { if (generated && !experiments && !experimentsMissing && !experimentsError) void loadExperiments() }, [generated, experiments, experimentsMissing, experimentsError, loadExperiments])
  const expLine = experimentSentence(sc?.id, experiments)

  return (
    <section className="panel scenario-simple">
      <div className="panel-title">
        <h2 className="eyebrow">Scenario</h2>
        {hasDisruptions && (
          <span className="panel-tools">
            {changing ? <button type="button" className="link" onClick={() => setChanging(false)}>Keep current</button>
              : <button type="button" className="link" onClick={() => setChanging(true)}>Change scenario</button>}
            <button type="button" className="btn small ghost" disabled={disabled} onClick={() => resetScenario().catch(() => undefined)} title="Healthy network, no disruptions">{busy === 'reset' ? <Spinner /> : 'Reset'}</button>
          </span>
        )}
      </div>
      {!showCards && sc && (
        <div className="scenario-card">
          <h3>{preset ? presetTitle(preset) : sc.name}</h3>
          <p>{preset ? firstSentence(sc.description || preset.description) : scenarioBlurb(sc.description)}</p>
          {expLine && <p>{expLine}</p>}
          {busy === 'load' && <Spinner label="Loading scenario…" />}
        </div>
      )}
      {showCards && (
        <>
          {!hasDisruptions && <p className="scenario-lead">Pick a disruption day, or let the guided demo build one for you.</p>}
          <PresetCards onPicked={() => setChanging(false)} />
        </>
      )}
    </section>
  )
}

const ORDER: Record<string, number> = { medical: 0, cargo: 1, passenger: 2 }

/** Simple-mode left column, part 2: what is happening, in human sentences, with live status per displayed run and time. */
export function Happening() {
  const scenario = useStore((s) => s.scenario)
  const network = useStore((s) => s.network)
  const run = useStore(selectDisplayedRun)
  const tIdx = useStore((s) => Math.floor(s.t / 30))
  const select = useStore((s) => s.select)
  const setHighlight = useStore((s) => s.setHighlight)
  const selected = useStore((s) => s.selected)
  const [showPax, setShowPax] = useState(false)
  const effects = new Map((scenario?.disruption_effects ?? []).map((e) => [e.id, e]))
  const events = (scenario?.scenario.disruptions ?? []).filter((d) => !MISSION_TYPES.has(d.type))
  const missions = [...(scenario?.missions ?? [])].sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.release_min - b.release_min || a.id.localeCompare(b.id))
  const critical = missions.filter((m) => m.type !== 'passenger')
  const pax = missions.filter((m) => m.type === 'passenger')
  const outcomes = new Map((run?.assignments ?? []).map((o) => [o.mission_id, o]))
  const snap = run ? run.trace.snapshots[Math.min(run.trace.snapshots.length - 1, tIdx)] : null
  const t = tIdx * 30

  const statusFor = (m: Mission) => {
    const o = outcomes.get(m.id)
    if (!run || !o) return null
    const live = snap?.mission_status[m.id]
    if (o.status === 'unserved') return { cls: 'danger', text: `not served · ${reasonText(o.infeasible_reason)}` }
    if (live === 'completed') return { cls: 'good', text: `done ${clock(o.complete_min)} · ${o.aircraft_id}` }
    if (live === 'active') return { cls: 'ns', text: `en route · ${o.aircraft_id}` }
    if (live === 'assigned') return { cls: 'base', text: `assigned ${o.aircraft_id}` }
    if (t >= m.release_min) return { cls: 'warn', text: 'waiting' }
    return { cls: 'base', text: `at ${clock(m.release_min)}` }
  }

  const row = (m: Mission) => {
    const h = describeMission(m, scenario, network)
    const o = outcomes.get(m.id)
    const st = statusFor(m)
    const isSel = selected?.id === m.id
    return (
      <li key={m.id} className={`strip mission human type-${m.type} ${o?.status === 'unserved' ? 'unserved' : ''} ${isSel ? 'selected' : ''}`}
        onClick={() => { select({ kind: 'mission', id: m.id }); setHighlight(o?.aircraft_id ? [o.aircraft_id] : [], o?.path ?? null) }}>
        <div className="strip-main">
          <div className="strip-label">{h.title}<span className="mono id-suffix">{m.id}</span></div>
          <div className="strip-meta">{h.meta}</div>
          {st && <div className={`strip-status ${st.cls}`}>{st.text}</div>}
        </div>
      </li>
    )
  }

  const empty = events.length === 0 && critical.length === 0
  return (
    <section className="panel grow happening">
      <div className="panel-title">
        <h2 className="eyebrow">What’s happening</h2>
        {run && <span className="eyebrow src">{run.strategy === 'do_nothing' ? 'do nothing' : run.strategy === 'northstar' ? 'NORTHSTAR' : 'baseline'} · {clock(t)}</span>}
      </div>
      {empty && <div className="empty">Nothing yet: the schedule flies as published.</div>}
      {events.length > 0 && (
        <ul className="event-list">
          {events.map((d) => {
            const e = effects.get(d.id)
            const h = describeDisruption(d, e, network)
            const active = h.start <= t && t < h.end
            return (
              <li key={d.id} className={`event disr-${d.type} ${active ? 'active' : t >= h.end ? 'over' : 'later'}`}>
                <span className="event-dot" aria-hidden />
                <span className="event-text">{h.text}<span className="event-when mono"> · {h.when}</span></span>
              </li>
            )
          })}
        </ul>
      )}
      {critical.length > 0 && <ul className="strip-list">{critical.map(row)}</ul>}
      {pax.length > 0 && (
        <>
          <button type="button" className="pax-toggle" onClick={() => setShowPax((v) => !v)} aria-expanded={showPax}>
            <span className="caret">{showPax ? '▾' : '▸'}</span> {pax.length} scheduled flights
            {run && <span className="muted"> · {pax.filter((m) => outcomes.get(m.id)?.status === 'unserved').length} cancelled</span>}
          </button>
          {showPax && <ul className="strip-list compact">{pax.map(row)}</ul>}
        </>
      )}
    </section>
  )
}
