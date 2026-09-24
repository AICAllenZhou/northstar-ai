import { statusAt } from '../lib/derive'
import { clock } from '../lib/time'
import { selectDisplayedRun, useStore } from '../state/store'

/** Four large tiles reflecting the displayed time, not the end of the day. */
export function StatusTiles() {
  const network = useStore((s) => s.network)
  const scenario = useStore((s) => s.scenario)
  const run = useStore(selectDisplayedRun)
  const tIdx = useStore((s) => Math.floor(s.t / 30))
  const displayedRun = useStore((s) => s.displayedRun)
  if (!network) return null
  const t = tIdx * 30
  const st = statusAt(scenario, run, t, network)
  const nCom = network.communities.length
  const disconnected = st.disconnected.size
  const failed = st.failedAircraft.size
  const closed = st.closedAirports.size
  const alerts = st.activeDisruptions.length
  const src = displayedRun === 'northstar' ? 'NORTHSTAR' : displayedRun === 'baseline' ? 'Baseline' : displayedRun === 'do_nothing' ? 'Do nothing' : scenario && scenario.scenario.disruptions.length ? 'declared effects' : 'schedule'
  return (
    <section className="tiles" aria-label="Network status">
      <div className="tiles-head">
        <span className="eyebrow">Network at {clock(t)}</span>
        <span className="eyebrow src">{src}</span>
      </div>
      <div className="tile-grid">
        <Tile label="Communities" value={nCom - disconnected} of={nCom} sub={disconnected ? `${disconnected} disconnected` : 'all connected'} tone={disconnected ? (st.structural.size ? 'danger' : 'warn') : 'good'} />
        <Tile label="Aircraft" value={network.aircraft.length - failed} of={network.aircraft.length} sub={failed ? `${failed} unserviceable` : 'all available'} tone={failed ? 'danger' : 'good'} />
        <Tile label="Airports open" value={network.airports.length - closed} of={network.airports.length} sub={closed ? `${closed} closed` : 'all open'} tone={closed ? 'danger' : 'good'} />
        <Tile label="Active alerts" value={alerts} sub={alerts ? st.activeDisruptions.map((d) => d.id).join(' · ') : 'none active'} tone={alerts ? 'warn' : 'good'} />
      </div>
    </section>
  )
}

function Tile({ label, value, of, sub, tone }: { label: string; value: number; of?: number; sub: string; tone: 'good' | 'warn' | 'danger' }) {
  return (
    <div className={`tile ${tone}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}{of !== undefined && <span className="tile-of">/{of}</span>}</div>
      <div className="tile-sub">{sub}</div>
    </div>
  )
}
