import { networkState, type NetworkState } from '../lib/derive'
import { useStore, type View } from '../state/store'

const FALLBACK_DISCLAIMER = 'NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for real-world flight operations, medical decisions, or aviation dispatch.'

const STATE_TEXT: Record<NetworkState, string> = {
  NORMAL: 'no disruptions',
  WARNING: 'disruptions not yet analysed',
  DISRUPTED: 'impact / baseline shown',
  OPTIMIZED: 'NORTHSTAR plan shown',
}

const TABS: { id: View; label: string }[] = [
  { id: 'command', label: 'Command Center' },
  { id: 'research', label: 'Research Results' },
  { id: 'responsible', label: 'Responsible AI' },
]

export function Header({ onDemo, demoActive }: { onDemo: () => void; demoActive: boolean }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const disclaimer = useStore((s) => s.network?.disclaimer) ?? FALLBACK_DISCLAIMER
  const state = useStore((s) => networkState(s.scenario, s.displayedRun))
  const scenarioName = useStore((s) => s.scenario?.scenario.name)
  return (
    <header className="hdr">
      <div className="hdr-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>NORTHSTAR AI</h1>
            <p>Northern Aviation Resilience Command Center</p>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={view === t.id} className={`tab ${view === t.id ? 'active' : ''}`} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="hdr-right">
          {scenarioName && <span className="scenario-name" title={scenarioName}>{scenarioName}</span>}
          <div className={`annunciator ${state.toLowerCase()}`} role="status" aria-label={`Network state ${state}`}>
            <span className="lamp" aria-hidden />
            <div>
              <div className="ann-state">{state}</div>
              <div className="ann-sub">{STATE_TEXT[state]}</div>
            </div>
          </div>
          <button className={`btn demo-btn ${demoActive ? 'active' : ''}`} onClick={onDemo}>{demoActive ? 'Demo running' : 'Demo Mode'}</button>
        </div>
      </div>
      <div className="disclaimer" role="note">
        <span className="disc-icon" aria-hidden>!</span>
        <span>{disclaimer}</span>
      </div>
    </header>
  )
}
