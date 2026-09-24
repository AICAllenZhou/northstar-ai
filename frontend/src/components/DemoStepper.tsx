import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pickDecision, presetTitle } from '../lib/humanize'
import { clock } from '../lib/time'
import { useStore } from '../state/store'
import { BACKUP_PRESETS, buildPlan, buildSteps, FIRST_ADD_STEP, PRIMARY_PRESET, type DemoPlan, type DemoStep } from './demoSteps'
import { ResultCard } from './ResultCard'
import { WhyCard } from './WhyCard'

interface Props {
  preset?: string
  initialStep?: number
  onExit: () => void
  /** Leave the simulation for the Research page; the app shows a "Back to the demo" toast that returns to `step`. */
  onPark: (step: number, preset: string) => void
}

export function DemoStepper({ preset: initialPreset = PRIMARY_PRESET, initialStep = 0, onExit, onPark }: Props) {
  const [preset, setPreset] = useState(initialPreset)
  const [attempt, setAttempt] = useState(0)
  const [plan, setPlan] = useState<DemoPlan | null>(null)
  const [steps, setSteps] = useState<DemoStep[]>([])
  const stepsRef = useRef<DemoStep[]>([])
  const startRef = useRef(initialStep)
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const state = useStore()
  const presets = useStore((s) => s.presets)
  const connection = useStore((s) => s.connection)
  const view = useStore((s) => s.view)
  const moment = useStore((s) => s.runMoment)
  const advanced = useStore((s) => s.advanced)
  const demoActive = useStore((s) => s.demoActive)
  // On wide layouts the command centre offers a dock in its right column; the card renders there so the
  // map is never covered. Below 1280 px (single column) it stays a bottom overlay.
  const [dock, setDock] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = () => setDock(window.innerWidth >= 1280 ? document.getElementById('demo-dock') : null)
    const id = window.setTimeout(find, 0)
    window.addEventListener('resize', find)
    return () => { window.clearTimeout(id); window.removeEventListener('resize', find) }
  }, [view, advanced, demoActive])

  const go = useCallback(async (i: number) => {
    const list = stepsRef.current
    if (i < 0 || i >= list.length) return
    setRunning(true)
    setError(null)
    try {
      await list[i].run()
      setStep(i)
    } catch (e) {
      setStep(i)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [])

  // Load the preset definition, build the narrative, start on the requested step.
  useEffect(() => {
    let cancelled = false
    buildPlan(preset).then((p) => {
      if (cancelled) return
      const list = buildSteps(p)
      stepsRef.current = list
      setPlan(p)
      setSteps(list)
      void go(Math.min(startRef.current, list.length - 1))
    }).catch((e) => {
      if (cancelled) return
      setError(e instanceof Error ? e.message : String(e))
      setRunning(false)
    })
    return () => { cancelled = true }
  }, [preset, attempt, go])

  const changePreset = (id: string) => {
    startRef.current = FIRST_ADD_STEP
    setRunning(true)
    setStep(-1)
    setPreset(id)
  }
  const retry = () => { if (step < 0 || !plan) setAttempt((a) => a + 1); else void go(step) }

  const current = step >= 0 ? steps[step] : null
  const total = steps.length || 10
  const last = steps.length > 0 && step === steps.length - 1
  const nsDone = !!state.runs.northstar
  const isRun = current?.kind === 'run'
  const showNext = !!current && !last && !(isRun && !nsDone)
  const caption = current ? current.caption(state) : 'Starting the demo…'
  const exit = () => { const st = useStore.getState(); st.pause(); st.setFocusPanel(null); st.highlightDecision(null); onExit() }
  const runNorthstar = () => { const next = step + 1; useStore.getState().startNorthstarRun(undefined, () => void go(next)) }
  const decision = current?.kind === 'why' ? (state.decisions.find((x) => x.mission_id === state.expandedDecision) ?? pickDecision(state.decisions)) : null
  const nameOf = (id: string) => { const p = presets.find((x) => x.id === id); return p ? presetTitle(p) : id }

  const docked = !!dock && view === 'command'
  const busy = running || !!moment
  const node = (
    <div className={`demo ${docked ? 'docked' : view === 'command' ? 'over-map' : 'over-page'}`} role="dialog" aria-label="Guided demo" aria-live="polite" hidden={!!moment && !docked}>
      <div className={`demo-card kind-${current?.kind ?? 'plain'}`}>
        <div className="demo-top">
          <div className="demo-steps" role="progressbar" aria-label="Demo progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={Math.max(1, step + 1)}>
            {(steps.length ? steps : Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: '' }))).map((s, i) => <span key={s.id} className={`dot ${i === step ? 'on' : i < step ? 'done' : ''}`} title={s.title} />)}
          </div>
          <div className="demo-meta">
            <span className="eyebrow">Guided demo · step {Math.max(1, step + 1)} of {total}</span>
            <label className="demo-preset">
              <span className="eyebrow">Scenario</span>
              <select className="input" value={preset} disabled={running} onChange={(e) => changePreset(e.target.value)} aria-label="Demo scenario">
                <option value={PRIMARY_PRESET}>{nameOf(PRIMARY_PRESET)} (primary)</option>
                {BACKUP_PRESETS.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="demo-content" key={step}>
        <h2 className="demo-title">{current?.title ?? 'Guided demo'}</h2>
        <p className="demo-caption">{running ? <span className="busy"><span className="spinner" /> Working…</span> : caption}</p>
        {!running && !error && current?.kind === 'damage' && <DamageCard />}
        {!running && !error && current?.kind === 'result' && <div className="demo-body"><ResultCard variant="in-demo" onWhy={() => void go(step + 1)} /></div>}
        {!running && !error && current?.kind === 'why' && (
          <div className="demo-body">
            {decision && <WhyCard decision={decision} variant="in-demo" />}
            <div className="demo-divider"><span>One scenario is not enough.</span></div>
            <button type="button" className="btn accent big" onClick={() => onPark(step, preset)}>See the 100-scenario results</button>
          </div>
        )}
        </div>
        {error && (
          <div className="demo-error" role="alert">
            <span>Step failed: {error}{connection === 'down' ? ' (backend unreachable)' : ''}</span>
            <button className="btn small" onClick={retry}>Retry</button>
          </div>
        )}
        <div className="demo-actions">
          <button className="btn ghost" onClick={exit}>Exit</button>
          <div className="spacer" />
          <button className="btn" disabled={busy || step <= 0} onClick={() => void go(step - 1)}>Back</button>
          {isRun && !nsDone && !running && !error && <button type="button" className="btn accent big demo-run" disabled={!!moment} onClick={runNorthstar}>RUN NORTHSTAR AI</button>}
          {showNext && <button className="btn accent big" disabled={busy} onClick={() => void go(step + 1)}>Next ▸</button>}
        </div>
      </div>
    </div>
  )
  return docked && dock ? createPortal(node, dock) : node
}

/** Step 6: exactly the do-nothing figures, from impact.do_nothing.metrics. */
function DamageCard() {
  const impact = useStore((s) => s.impact)
  if (!impact) return null
  const m = impact.do_nothing.metrics
  const medServed = m.medical_count - m.medical_unserved
  const cargoServed = m.cargo_count - m.cargo_unserved
  return (
    <div className="damage" aria-label="If nobody reacts">
      <Fig label="Communities cut off" big={String(m.disconnected_communities_peak)} sub={`peak at ${clock(impact.peak_disconnected_t)} · ${m.disconnected_communities_end} still cut off at end of day`} tone={m.disconnected_communities_peak ? 'danger' : 'good'} />
      <Fig label="Medevac" big={m.medical_count === 0 ? 'none' : m.medical_unserved ? 'not served' : 'served'} sub={m.medical_count === 0 ? 'no request today' : `${medServed} served · ${m.medical_unserved} not served within 24 h`} tone={m.medical_count === 0 ? 'neutral' : m.medical_unserved ? 'danger' : 'good'} />
      <Fig label="Essential cargo" big={m.cargo_count === 0 ? 'none' : m.cargo_unserved ? 'not delivered' : 'delivered'} sub={m.cargo_count === 0 ? 'no request today' : `${cargoServed} delivered · ${m.cargo_unserved} not delivered`} tone={m.cargo_count === 0 ? 'neutral' : m.cargo_unserved ? 'danger' : 'good'} />
      <Fig label="Cancelled flights" big={String(m.cancelled_flights)} sub={`of ${m.passenger_count} scheduled`} tone={m.cancelled_flights ? 'danger' : 'good'} />
    </div>
  )
}

function Fig({ label, big, sub, tone }: { label: string; big: string; sub: string; tone: 'danger' | 'good' | 'neutral' }) {
  return (
    <div className={`fig ${tone}`}>
      <div className="fig-label">{label}</div>
      <div className="fig-big">{big}</div>
      <div className="fig-sub">{sub}</div>
    </div>
  )
}
