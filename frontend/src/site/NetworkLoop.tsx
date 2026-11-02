import { useEffect, useId, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Scenario } from '../api/types'
import type { FeatureCollection } from 'geojson'
import { PRIMARY_PRESET } from '../components/demoSteps'
import { useStore } from '../state/store'
import { buildCoastPaths, type CoastPaths } from './coast'
import { buildLoopModel, PHASES, phaseCopy, type LoopModel, type LoopPhase } from './loopModel'

const PHASE_MS = 4000 // three states, 12-second loop

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** The hero's signature element: the real network cycling CONNECTED → DISRUPTED → OPTIMIZED. */
export function NetworkLoop() {
  const network = useStore((s) => s.network)
  const connection = useStore((s) => s.connection)
  const [preset, setPreset] = useState<Scenario | null>(null)
  const [provinces, setProvinces] = useState<FeatureCollection | null>(null)
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<LoopPhase>('connected')

  useEffect(() => {
    let alive = true
    api.presetDetail(PRIMARY_PRESET).then((p) => { if (alive) setPreset(p) }).catch(() => undefined)
    // The coastline is a quiet backdrop: if it fails to load the loop still draws.
    api.basemap('provinces').then((fc) => { if (alive) setProvinces(fc) }).catch(() => undefined)
    return () => { alive = false }
  }, [connection])

  const model = useMemo(() => (network ? buildLoopModel(network, preset) : null), [network, preset])
  const coast = useMemo(() => (model && provinces ? buildCoastPaths(provinces, model.project, model.width, model.height) : null), [model, provinces])

  useEffect(() => {
    if (reduced || !model?.fire) return
    const id = setInterval(() => setPhase((p) => PHASES[(PHASES.indexOf(p) + 1) % PHASES.length]), PHASE_MS)
    return () => clearInterval(id)
  }, [reduced, model])

  if (!model) {
    return (
      <div className="loop-placeholder" role="status">
        {connection === 'down'
          ? 'The network map is drawn from the local NORTHSTAR backend, which is not answering. Start it with: cd backend && uv run uvicorn northstar.api.main:app --port 8000'
          : 'Loading the network…'}
      </div>
    )
  }

  const caption = <figcaption className="loop-caption">Illustration of the primary demo scenario · real geography, synthetic operations</figcaption>

  if (reduced && model.fire) {
    return (
      <figure className="loop">
        <div className="loop-pair">
          {(['disrupted', 'optimized'] as LoopPhase[]).map((p) => (
            <div key={p}>
              <PhaseLabel model={model} phase={p} />
              <NetworkFigure model={model} coast={coast} phase={p} animated={false} />
            </div>
          ))}
        </div>
        {caption}
      </figure>
    )
  }

  return (
    <figure className="loop">
      <PhaseLabel model={model} phase={phase} />
      <NetworkFigure model={model} coast={coast} phase={phase} animated={!reduced} />
      {caption}
    </figure>
  )
}

function PhaseLabel({ model, phase }: { model: LoopModel; phase: LoopPhase }) {
  const c = phaseCopy(model, phase)
  return (
    <div className={`loop-state ${phase}`}>
      <span className="st">{c.label}</span>
      <span className="det">{c.detail}</span>
    </div>
  )
}

function NetworkFigure({ model, coast, phase, animated }: { model: LoopModel; coast: CoastPaths | null; phase: LoopPhase; animated: boolean }) {
  const gid = useId().replaceAll(':', '')
  const c = phaseCopy(model, phase)
  return (
    <svg
      className={`loop-svg phase-${phase} ${animated ? '' : 'static'}`}
      viewBox={`0 0 ${model.width} ${model.height}`}
      role="img"
      aria-label={`Network map of Nunavut, state ${c.label}: ${c.detail}`}
    >
      <defs>
        <radialGradient id={`fire-${gid}`}>
          <stop offset="0%" stopColor="#f5a623" stopOpacity="0.28" />
          <stop offset="70%" stopColor="#f5a623" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#f5a623" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip-${gid}`}><rect x="0" y="0" width={model.width} height={model.height} /></clipPath>
      </defs>
      {coast && (
        <g className="coast" clipPath={`url(#clip-${gid})`} aria-hidden>
          <path className="coast-other" d={coast.other} />
          <path className="coast-nunavut" d={coast.nunavut} />
        </g>
      )}
      {model.fire && (
        <g className="fire">
          <circle cx={model.fire.x} cy={model.fire.y} r={model.fire.r * 1.35} fill={`url(#fire-${gid})`} />
          <circle className="fire-ring" cx={model.fire.x} cy={model.fire.y} r={model.fire.r} />
        </g>
      )}
      <g className="edges">
        {model.edges.map((e) => (
          <line key={e.id} className={`rt ${e.closed ? 'closed' : ''} ${e.opt ? 'opt' : ''} ${e.stub ? 'stub' : ''}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
        ))}
      </g>
      {animated && (
        <g className="pulses" aria-hidden>
          {model.edges.map((e, i) => (
            <line
              key={e.id}
              className={`pulse ${e.closed ? 'closed' : ''} ${e.opt ? 'opt' : ''} ${e.stub ? 'stub' : ''}`}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              style={{ animationDelay: `${-((i * 0.53) % 6)}s` }}
            />
          ))}
        </g>
      )}
      <g className="nodes">
        {model.nodes.map((n) => (
          <g
            key={n.id}
            className={`ap ${n.hub ? 'hub' : ''} ${n.closed ? 'closed' : ''} ${n.cut ? 'cut' : ''} ${n.reconnected ? 'recon' : ''}`}
            transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
          >
            <circle className="ring" r={n.hub ? 10 : 7} />
            <circle className="dot" r={n.hub ? 4.5 : 2.8} />
            <text className="lbl" x={n.hub ? 14 : 11} y={4}>{n.hub ? n.name.toUpperCase() : n.name}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
