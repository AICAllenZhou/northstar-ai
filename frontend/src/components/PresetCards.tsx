import { complexity, firstSentence, presetTitle } from '../lib/humanize'
import { selectControlsDisabled, selectWarm, useStore } from '../state/store'
import { PRIMARY_PRESET } from './demoSteps'

/** Five scenario cards (plus a quiet custom card); clicking loads, the secondary link starts the guided demo with it. */
export function PresetCards({ onPicked }: { onPicked?: () => void }) {
  const presets = useStore((s) => s.presets)
  const currentId = useStore((s) => s.scenario?.scenario.id)
  const loadPreset = useStore((s) => s.loadPreset)
  const requestDemo = useStore((s) => s.requestDemo)
  const setAdvanced = useStore((s) => s.setAdvanced)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const warm = useStore(selectWarm)
  const warmList = useStore((s) => s.health?.warmup?.presets)
  const disabled = useStore(selectControlsDisabled)
  const cards = presets.filter((p) => p.disruption_count > 0)
  return (
    <div className="preset-grid" role="list">
      {cards.map((p) => {
        const cx = complexity(p.disruption_count)
        const pre = warm && (!warmList || warmList.includes(p.id))
        return (
          <article key={p.id} className={`preset-card ${currentId === p.id ? 'current' : ''}`} role="listitem">
            <button type="button" className="preset-main" disabled={disabled} onClick={() => { loadPreset(p.id).then(() => onPicked?.()).catch(() => undefined) }} aria-label={`Load ${presetTitle(p)}`}>
              <div className="preset-tags">
                {p.id === PRIMARY_PRESET && <span className="chip ns">Primary demo</span>}
                <span className={`chip cx cx-${cx.toLowerCase()}`}>{cx} complexity</span>
                {pre && <span className="chip good">Precomputed ✓</span>}
              </div>
              <h3>{presetTitle(p)}</h3>
              <p>{firstSentence(p.description)}</p>
            </button>
            <button type="button" className="link preset-demo" disabled={disabled} onClick={() => requestDemo(p.id)}>Guided demo with this scenario →</button>
          </article>
        )
      })}
      <article className="preset-card custom" role="listitem">
        <button type="button" className="preset-main" disabled={disabled} onClick={() => { setAdvanced(true); setFocusPanel('disruption-form') }}>
          <h3>Custom scenario</h3>
          <p>Add your own closures, weather, failures and requests in Advanced mode.</p>
        </button>
      </article>
    </div>
  )
}
