import { networkState, type NetworkState } from '../lib/derive'
import { presetTitle } from '../lib/humanize'
import { HREF } from '../router'
import { useStore } from '../state/store'

const FALLBACK_DISCLAIMER = 'NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for real-world flight operations, medical decisions, or aviation dispatch.'

const STATE_TEXT: Record<NetworkState, string> = {
  NORMAL: 'no disruptions',
  WARNING: 'disruptions not yet analysed',
  DISRUPTED: 'impact / baseline shown',
  OPTIMIZED: 'NORTHSTAR plan shown',
}

/** Compact application header, shown on the Simulation route only. */
export function Header({ onDemo, demoActive }: { onDemo: () => void; demoActive: boolean }) {
  const disclaimer = useStore((s) => s.network?.disclaimer) ?? FALLBACK_DISCLAIMER
  const state = useStore((s) => networkState(s.scenario, s.displayedRun))
  // One name everywhere: the preset's display title when a preset is loaded, else the scenario's own name.
  const scenarioName = useStore((s) => {
    const sc = s.scenario?.scenario
    if (!sc) return undefined
    const p = s.presets.find((x) => x.id === sc.id)
    return p ? presetTitle(p) : sc.name
  })
  const advanced = useStore((s) => s.advanced)
  const setAdvanced = useStore((s) => s.setAdvanced)
  return (
    <header className="hdr">
      <div className="hdr-row">
        <a className="brand" href={HREF.home} aria-label="NORTHSTAR AI home">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>NORTHSTAR AI</h1>
            <p>Command center</p>
          </div>
        </a>
        <a className="site-link" href={HREF.home}>← Site</a>
        <div className="hdr-right">
          {scenarioName && <span className="scenario-name" title={scenarioName}>{scenarioName}</span>}
          <div className={`annunciator ${state.toLowerCase()}`} role="status" aria-label={`Network state ${state}`}>
            <span className="lamp" aria-hidden />
            <div>
              <div className="ann-state">{state}</div>
              <div className="ann-sub">{STATE_TEXT[state]}</div>
            </div>
          </div>
          <label className="switch" title="Show every control, metric and diagnostic">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            <span className="switch-track" aria-hidden><span className="switch-knob" /></span>
            <span className="switch-label">Advanced</span>
          </label>
          <button className={`btn accent demo-btn ${demoActive ? 'active' : ''}`} onClick={onDemo} aria-pressed={demoActive}>
            {demoActive ? 'Demo running · exit' : 'Start guided demo'}
          </button>
        </div>
      </div>
      <div className="disclaimer" role="note">
        <span className="disc-icon" aria-hidden>!</span>
        <span>{disclaimer}</span>
      </div>
    </header>
  )
}
