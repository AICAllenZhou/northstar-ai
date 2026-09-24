import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { BACKUP_PRESETS, DEMO_STEPS, PRIMARY_PRESET } from './demoSteps'

export function DemoStepper({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(-1)
  const [preset, setPreset] = useState(PRIMARY_PRESET)
  const presetRef = useRef(PRIMARY_PRESET)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = useStore()
  const presets = useStore((s) => s.presets)
  const connection = useStore((s) => s.connection)
  const view = useStore((s) => s.view)

  const go = useCallback(async (i: number) => {
    if (i < 0 || i >= DEMO_STEPS.length) return
    setRunning(true)
    setError(null)
    try {
      await DEMO_STEPS[i].run(presetRef.current)
      setStep(i)
    } catch (e) {
      setStep(i)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [])

  // Start on the first step once mounted (deferred so no state is set synchronously in the effect).
  useEffect(() => {
    const id = setTimeout(() => { void go(0) }, 0)
    return () => clearTimeout(id)
  }, [go])

  const current = step >= 0 ? DEMO_STEPS[step] : null
  const caption = current ? current.caption(state) : 'Starting the demo…'
  const last = step === DEMO_STEPS.length - 1
  const exit = () => { useStore.getState().pause(); useStore.getState().setFocusPanel(null); onExit() }

  return (
    <div className={`demo ${view === 'command' ? 'over-map' : 'over-page'}`} role="dialog" aria-label="Demo mode" aria-live="polite">
      <div className="demo-card">
        <div className="demo-top">
          <div className="demo-steps" aria-hidden>
            {DEMO_STEPS.map((s, i) => <span key={s.title} className={`dot ${i === step ? 'on' : i < step ? 'done' : ''}`} title={s.title} />)}
          </div>
          <div className="demo-meta">
            <span className="eyebrow">Demo mode · step {Math.max(1, step + 1)} of {DEMO_STEPS.length}</span>
            <label className="demo-preset">
              <span className="eyebrow">Preset</span>
              <select className="input" value={preset} disabled={running} onChange={(e) => { presetRef.current = e.target.value; setPreset(e.target.value); void go(1) }}>
                <option value={PRIMARY_PRESET}>{presets.find((p) => p.id === PRIMARY_PRESET)?.name ?? PRIMARY_PRESET} (primary)</option>
                {BACKUP_PRESETS.map((id) => <option key={id} value={id}>{presets.find((p) => p.id === id)?.name ?? id}</option>)}
              </select>
            </label>
          </div>
        </div>
        <h2 className="demo-title">{current?.title ?? 'Demo'}</h2>
        <p className="demo-caption">{running ? <span className="busy"><span className="spinner" /> Working…</span> : caption}</p>
        {error && (
          <div className="demo-error" role="alert">
            <span>Step failed: {error}{connection === 'down' ? ' (backend unreachable)' : ''}</span>
            <button className="btn small" onClick={() => void go(step)}>Retry</button>
          </div>
        )}
        <div className="demo-actions">
          <button className="btn ghost" onClick={exit}>Exit</button>
          <div className="spacer" />
          <button className="btn" disabled={running || step <= 0} onClick={() => void go(step - 1)}>Back</button>
          <button className="btn accent big" disabled={running || last} onClick={() => void go(step + 1)}>{last ? 'End of demo' : 'Next ▸'}</button>
        </div>
      </div>
    </div>
  )
}
