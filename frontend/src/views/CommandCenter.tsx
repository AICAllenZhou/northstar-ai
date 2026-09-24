import { ComparePanel } from '../components/ComparePanel'
import { DecisionsPanel } from '../components/DecisionsPanel'
import { MissionList } from '../components/MissionList'
import { RunPanel } from '../components/RunPanel'
import { ScenarioPanel } from '../components/ScenarioPanel'
import { StatusTiles } from '../components/StatusTiles'
import { Timeline } from '../components/Timeline'
import { MapView } from '../map/MapView'

export function CommandCenter() {
  return (
    <div className="cc">
      <aside className="cc-left" aria-label="Scenario">
        <ScenarioPanel />
        <MissionList />
      </aside>
      <main className="cc-map" aria-label="Network map">
        <MapView />
      </main>
      <aside className="cc-right" aria-label="Response">
        <StatusTiles />
        <RunPanel />
        <ComparePanel />
        <DecisionsPanel />
      </aside>
      <footer className="cc-timeline">
        <Timeline />
      </footer>
    </div>
  )
}
