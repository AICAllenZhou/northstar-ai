import { useState } from 'react'
import { DISRUPTION_LABEL } from '../lib/format'
import { clock } from '../lib/time'
import { selectControlsDisabled, useStore } from '../state/store'
import { DisruptionForm } from './DisruptionForm'
import { Spinner } from './ui'

export function ScenarioPanel() {
  const presets = useStore((s) => s.presets)
  const scenario = useStore((s) => s.scenario)
  const loadPreset = useStore((s) => s.loadPreset)
  const resetScenario = useStore((s) => s.resetScenario)
  const removeDisruption = useStore((s) => s.removeDisruption)
  const busy = useStore((s) => s.busy)
  const disabled = useStore(selectControlsDisabled)
  const [showForm, setShowForm] = useState(false)
  const currentId = scenario?.scenario.id ?? ''
  const isPreset = presets.some((p) => p.id === currentId)
  const current = presets.find((p) => p.id === currentId)
  const disruptions = scenario?.scenario.disruptions ?? []
  const effects = new Map((scenario?.disruption_effects ?? []).map((e) => [e.id, e]))

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <span className="eyebrow">Scenario</span>
          <button className="btn small ghost" disabled={disabled} onClick={() => void resetScenario()} title="Healthy network, no disruptions">
            {busy === 'reset' ? <Spinner /> : 'Reset'}
          </button>
        </div>
        <div className="panel-body">
          <select className="input" value={isPreset ? currentId : '__custom'} disabled={disabled} onChange={(e) => { if (e.target.value !== '__custom') void loadPreset(e.target.value) }} aria-label="Preset scenario">
            {!isPreset && <option value="__custom">{scenario?.scenario.name ?? 'Custom scenario'}</option>}
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="preset-desc">{current?.description ?? scenario?.scenario.description ?? 'Loading presets…'}</p>
          {busy === 'load' && <Spinner label="Loading scenario…" />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <span className="eyebrow">Disruptions <span className="count">{disruptions.length}</span></span>
          <button className="btn small" disabled={disabled} onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>{showForm ? 'Close' : '+ Add disruption'}</button>
        </div>
        {showForm && <DisruptionForm onDone={() => setShowForm(false)} />}
        {disruptions.length === 0 ? (
          <div className="empty">No disruptions. Pick a preset or add one to break the network.</div>
        ) : (
          <ul className="strip-list">
            {disruptions.map((d) => {
              const e = effects.get(d.id)
              return (
                <li key={d.id} className={`strip disr-${d.type}`}>
                  <div className="strip-main">
                    <div className="strip-top"><span className="mono">{d.id}</span><span className="strip-kind">{DISRUPTION_LABEL[d.type]}</span></div>
                    <div className="strip-label">{d.label || e?.label || d.type}</div>
                    <div className="strip-meta">
                      {clock(d.start_min)}–{clock(d.start_min + d.duration_min, true)}
                      {e?.affected_airports?.length ? ` · ${e.closes_airports ? 'closes' : 'affects'} ${e.affected_airports.join(', ')}` : ''}
                      {d.type === 'aircraft_failure' ? ` · ${d.target_ids.join(', ')}` : ''}
                    </div>
                  </div>
                  <button className="btn small ghost" disabled={disabled} onClick={() => void removeDisruption(d.id)} aria-label={`Remove ${d.id}`}>✕</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
