// Directional "flow" on the routes the displayed run actually flew: a MapLibre
// line-dasharray stepped through a short sequence at ~12 fps. The loop is
// imperative (no React state) and stops whenever it would be pointless or
// unwanted: no run displayed, tab hidden, reduced motion, or map removed.
import type { Map as MlMap } from 'maplibre-gl'
import type { StrategyName } from '../api/types'

export const STRATEGIES: StrategyName[] = ['do_nothing', 'baseline', 'northstar']
export const flowLayerId = (s: StrategyName) => `flow-${s}`

/** Dash phases (units of line width): a 3-long dash moving through a 4-long gap. */
export const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]
const FRAME_MS = 1000 / 12

export interface FlowController {
  /** Whether a run is displayed (the only input that comes from application state). */
  setActive(active: boolean): void
  /** Stops the loop and removes listeners; the controller cannot be restarted. */
  dispose(): void
  readonly running: boolean
  readonly ticks: number
}

export function createFlowController(map: MlMap): FlowController {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  let active = false
  let disposed = false
  let raf = 0
  let last = 0
  let step = 0
  let ticks = 0
  let running = false

  const shouldRun = () => active && !disposed && !mq.matches && document.visibilityState === 'visible'

  const frame = (now: number) => {
    if (!shouldRun()) { running = false; raf = 0; return }
    if (now - last >= FRAME_MS) {
      last = now
      step = (step + 1) % DASH_SEQUENCE.length
      ticks++
      const dash = DASH_SEQUENCE[step]
      for (const s of STRATEGIES) if (map.getLayer(flowLayerId(s))) map.setPaintProperty(flowLayerId(s), 'line-dasharray', dash)
    }
    raf = requestAnimationFrame(frame)
  }
  const sync = () => {
    if (shouldRun()) {
      if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame) }
    } else if (running) {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
  }
  document.addEventListener('visibilitychange', sync)
  mq.addEventListener('change', sync)

  const ctl: FlowController = {
    setActive(v) { active = v; sync() },
    dispose() {
      disposed = true
      sync()
      document.removeEventListener('visibilitychange', sync)
      mq.removeEventListener('change', sync)
    },
    get running() { return running },
    get ticks() { return ticks },
  }
  return ctl
}
