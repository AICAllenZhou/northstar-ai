import { useState } from 'react'
import type { DisruptionEffect, StrategyName } from '../api/types'
import { clock } from '../lib/time'
import { SPEEDS, useStore } from '../state/store'

const EMPTY_EFFECTS: DisruptionEffect[] = []
const HOURS = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]
const RUNS: { id: StrategyName; label: string }[] = [
  { id: 'do_nothing', label: 'Do nothing' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'northstar', label: 'NORTHSTAR' },
]

/** Play/pause, clock and scrubber always; speed and trace toggles fold behind "⋯" in simple mode. */
export function Timeline({ simple = false }: { simple?: boolean }) {
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const play = useStore((s) => s.play)
  const pause = useStore((s) => s.pause)
  const setTime = useStore((s) => s.setTime)
  const setSpeed = useStore((s) => s.setSpeed)
  const displayedRun = useStore((s) => s.displayedRun)
  const setDisplayedRun = useStore((s) => s.setDisplayedRun)
  const runs = useStore((s) => s.runs)
  const hasDisruptions = useStore((s) => (s.scenario?.scenario.disruptions.length ?? 0) > 0)
  const effects = useStore((s) => s.scenario?.disruption_effects) ?? EMPTY_EFFECTS
  const [more, setMore] = useState(false)
  const showExtras = !simple || more
  const pct = (t / 1440) * 100
  return (
    <div className={`timeline ${simple ? 'simple' : ''}`} role="group" aria-label="Timeline">
      <div className="tl-controls">
        <button className="btn play" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        {showExtras && (
          <div className="seg speed" aria-label="Playback speed">
            {SPEEDS.map((sp) => <button key={sp} className={speed === sp ? 'on' : ''} onClick={() => setSpeed(sp)}>{sp / 60}×</button>)}
          </div>
        )}
        <div className="tl-clock mono">{clock(t, true)}</div>
      </div>
      <div className="tl-track">
        <div className="tl-ticks" aria-hidden>
          {HOURS.map((h) => <span key={h} style={{ left: `${(h / 1440) * 100}%` }}>{clock(h)}</span>)}
        </div>
        <div className="tl-marks" aria-hidden>
          {effects.map((e) => <span key={e.id} className={`tl-mark ${e.type}`} style={{ left: `${(e.start_min / 1440) * 100}%`, width: `${Math.max(0.4, ((e.end_min - e.start_min) / 1440) * 100)}%` }} title={`${e.label} ${clock(e.start_min)}–${clock(e.end_min, true)}`} />)}
        </div>
        <input type="range" min={0} max={1440} step={1} value={Math.round(t)} onChange={(e) => { pause(); setTime(Number(e.target.value)) }} aria-label="Simulation time" style={{ ['--pct' as string]: `${pct}%` }} />
      </div>
      <div className="tl-right">
        {showExtras && (
          <div className="seg trace" aria-label="Displayed run">
            {RUNS.map((r) => {
              const available = r.id === 'do_nothing' ? hasDisruptions || !!runs.do_nothing : !!runs[r.id]
              return (
                <button key={r.id} className={`${displayedRun === r.id ? 'on' : ''} run-${r.id}`} disabled={!available} onClick={() => setDisplayedRun(r.id)} title={available ? `Show the ${r.label} trace` : `${r.label} not computed yet`}>
                  {r.label}
                </button>
              )
            })}
          </div>
        )}
        {simple && (
          <button type="button" className={`btn ghost tl-more ${more ? 'on' : ''}`} onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label={more ? 'Hide speed and trace controls' : 'Show speed and trace controls'} title="Speed and displayed run">⋯</button>
        )}
      </div>
    </div>
  )
}
