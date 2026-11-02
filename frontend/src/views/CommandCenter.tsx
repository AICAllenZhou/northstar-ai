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
  const demoActive = useStore((s) => s.demoActive)
  const dimmed = useStore((s) => s.runMoment !== null)
  // While the guided demo is open in simple mode, its card docks into this column (wide layouts) in place of
  // the action stack and carries the result and why cards, so the map stays fully visible.
  const docked = demoActive && !advanced
  const showCards = !docked
  return (
    <div className={`cc ${advanced ? 'advanced' : 'simple'} ${docked ? 'docked' : ''}`}>
      <aside className="cc-left" aria-label="Scenario">
        {advanced ? <><ScenarioPanel /><MissionList /></> : <><ScenarioSimple /><Happening /></>}
      </aside>
      <main className={`cc-map ${dimmed ? 'dimmed' : ''}`} aria-label="Network map">
        <MapView />
        <div className="cc-dim" aria-hidden />
        <RunMoment />
      </main>
      <aside className="cc-right" aria-label="Response">
        <StatusTiles simple={!advanced} />
        {advanced ? <><RunPanel /><ComparePanel /><DecisionsPanel /></> : <>{docked ? <div id="demo-dock" className="demo-dock" /> : <ActionStack />}{showCards && <><ResultCard /><WhyPanel /></>}</>}
      </aside>
      <footer className="cc-timeline">
        <Timeline simple={!advanced} />
      </footer>
    </div>
  )
}
