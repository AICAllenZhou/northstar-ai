import { useState } from 'react'
import { useStore } from '../state/store'

const KEY = 'northstar.legend'
function loadLegend(): boolean | null {
  try { const v = window.localStorage.getItem(KEY); return v === '1' ? true : v === '0' ? false : null } catch { return null }
}
function saveLegend(v: boolean): void {
  try { window.localStorage.setItem(KEY, v ? '1' : '0') } catch { /* preference simply does not persist */ }
}
const defaultOpen = () => { try { return window.innerWidth >= 1440 } catch { return true } }

/** Collapsible map legend, bottom-left of the map. Expanded by default on wide layouts (≥ 1440 px), collapsed
 *  below; the viewer's choice is remembered (localStorage `northstar.legend`). While the info panel is open in
 *  the same corner the legend folds to its button and returns to the remembered state when the panel closes. */
export function MapLegend() {
  const infoOpen = useStore((s) => !!s.selected && !(s.demoActive && !s.advanced))
  // `pref` is the remembered choice; `open` is what shows. Derived from the previous render (no effect): the info
  // panel opening folds the legend, closing it restores the preference.
  const [state, setState] = useState(() => { const pref = loadLegend() ?? defaultOpen(); return { infoOpen, pref, open: infoOpen ? false : pref } })
  if (state.infoOpen !== infoOpen) setState({ ...state, infoOpen, open: infoOpen ? false : state.pref })
  const open = state.open
  const toggle = () => { const v = !open; saveLegend(v); setState({ infoOpen, pref: v, open: v }) }
  return (
    <div className={`map-legend ${open ? 'open' : 'closed'}`}>
      <button type="button" className="legend-toggle" aria-expanded={open} aria-controls="map-legend-items" onClick={toggle} title={open ? 'Hide the legend' : 'Show the legend'}>
        <span className="caret" aria-hidden>{open ? '▾' : '▸'}</span>Legend
      </button>
      <div id="map-legend-items" className="legend-items" hidden={!open}>
        <div className="legend-item"><span className="sw hub" />Hub</div>
        <div className="legend-item"><span className="sw com" />Community</div>
        <div className="legend-item"><span className="sw closed" />Closed airport</div>
        <div className="legend-item"><span className="sw disc" />No service</div>
        <div className="legend-item"><span className="sw iso" />Isolated</div>
        <div className="legend-item"><span className="sw line closed" />Closed route</div>
        <div className="legend-item"><span className="sw plane med" />Medevac</div>
        <div className="legend-item"><span className="sw plane pax" />Passenger</div>
        <div className="legend-item"><span className="sw plane combi" />Combi</div>
        <div className="legend-item"><span className="sw plane util" />Utility</div>
        <div className="legend-item"><span className="sw fire" />Wildfire</div>
        <div className="legend-item"><span className="sw wx" />Weather</div>
        <div className="legend-item"><span className="sw line flow" />Flow: direction flown</div>
        <div className="legend-item"><span className="sw line trail" />Trail: leg so far</div>
      </div>
    </div>
  )
}
