import { ActionStack } from '../components/ActionStack'
import { ComparePanel } from '../components/ComparePanel'
import { DecisionsPanel } from '../components/DecisionsPanel'
import { MissionList } from '../components/MissionList'
import { ResultCard } from '../components/ResultCard'
import { RunMoment } from '../components/RunMoment'
import { RunPanel } from '../components/RunPanel'
import { ScenarioPanel } from '../components/ScenarioPanel'
import { Happening, ScenarioSimple } from '../components/ScenarioSimple'
import { StatusTiles } from '../components/StatusTiles'
import { Timeline } from '../components/Timeline'
import { WhyPanel } from '../components/WhyCard'
import { MapView } from '../map/MapView'
import { useStore } from '../state/store'

/** Simple mode (default): map, status, what is happening, one primary action, a short result.
 *  Advanced mode: every control, the ten-metric table, solver diagnostics and the full decision list. */
export function CommandCenter() {
  const advanced = useStore((s) => s.advanced)
  return (
    <div className={`cc ${advanced ? 'advanced' : 'simple'}`}>
      <aside className="cc-left" aria-label="Scenario">
        {advanced ? <><ScenarioPanel /><MissionList /></> : <><ScenarioSimple /><Happening /></>}
      </aside>
      <main className="cc-map" aria-label="Network map">
        <MapView />
        <RunMoment />
      </main>
      <aside className="cc-right" aria-label="Response">
        <StatusTiles simple={!advanced} />
        {advanced ? <><RunPanel /><ComparePanel /><DecisionsPanel /></> : <><ActionStack /><ResultCard /><WhyPanel /></>}
      </aside>
      <footer className="cc-timeline">
        <Timeline simple={!advanced} />
      </footer>
    </div>
  )
}
