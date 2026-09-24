import { statusAt } from '../lib/derive'
import { DISRUPTION_LABEL } from '../lib/format'
import { clock } from '../lib/time'
import { selectDisplayedRun, useStore } from '../state/store'

/** Large tiles reflecting the displayed time, not the end of the day.
 *  Simple mode: three tiles (four when a trace is displayed); Advanced: the full four. */
export function StatusTiles({ simple = false }: { simple?: boolean }) {
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
  const alertNames = [...new Set(st.activeDisruptions.map((d) => DISRUPTION_LABEL[d.type] ?? d.type))].join(' · ')
  const comTone = disconnected ? (st.structural.size ? 'danger' : 'warn') : 'good'

  if (simple) {
    const four = !!run
    return (
      <section className={`tiles simple ${four ? 'n4' : 'n3'}`} aria-label="Network status">
        <div className="tiles-head">
          <span className="eyebrow">Network at {clock(t)}</span>
          <span className="eyebrow src">{src}</span>
        </div>
        <div className="tile-grid">
          <Tile label="Communities connected" value={nCom - disconnected} of={nCom} sub={disconnected ? `${disconnected} without service` : 'all connected'} tone={comTone} />
          <Tile label="Aircraft available" value={network.aircraft.length - failed} of={network.aircraft.length} sub={failed ? `${failed} grounded` : 'all available'} tone={failed ? 'danger' : 'good'} />
          <Tile label="Active alerts" value={alerts} sub={alerts ? alertNames : 'none active'} tone={alerts ? 'warn' : 'good'} />
          {four && <Tile label="Cut off now" value={disconnected} sub={disconnected ? (st.structural.size ? `${st.structural.size} isolated` : 'no service at this hour') : 'none'} tone={disconnected ? 'danger' : 'good'} />}
        </div>
      </section>
    )
  }

  return (
    <section className="tiles" aria-label="Network status">
      <div className="tiles-head">
        <span className="eyebrow">Network at {clock(t)}</span>
        <span className="eyebrow src">{src}</span>
      </div>
      <div className="tile-grid">
        <Tile label="Communities" value={nCom - disconnected} of={nCom} sub={disconnected ? `${disconnected} disconnected` : 'all connected'} tone={comTone} />
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
      <div className="tile-sub" title={sub}>{sub}</div>
    </div>
  )
}
