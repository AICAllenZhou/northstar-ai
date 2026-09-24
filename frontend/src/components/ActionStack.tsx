import { selectControlsDisabled, selectHasDisruptions, useStore } from '../state/store'
import { RunStatus } from './RunPanel'
import { Spinner } from './ui'

/** Simple-mode primary actions: guided demo first, then RUN NORTHSTAR AI, then the baseline. */
export function ActionStack() {
  const requestDemo = useStore((s) => s.requestDemo)
  const startNorthstarRun = useStore((s) => s.startNorthstarRun)
  const runBaseline = useStore((s) => s.runBaseline)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const policyId = useStore((s) => s.policyId)
  const policies = useStore((s) => s.policies)
  const busy = useStore((s) => s.busy)
  const disabled = useStore(selectControlsDisabled)
  const runs = useStore((s) => s.runs)
  const decisions = useStore((s) => s.decisions)
  const hasDisruptions = useStore(selectHasDisruptions)
  const demoActive = useStore((s) => s.demoActive)
  const policy = policies.find((p) => p.id === policyId)
  const ns = runs.northstar
  return (
    <section className="panel actions">
      {!demoActive && (
        <button type="button" className="act-demo" onClick={() => requestDemo()}>
          <span className="act-title">Start guided demo</span>
          <span className="act-sub">about 4 minutes · one button</span>
        </button>
      )}
      <button type="button" className="run-btn northstar" disabled={disabled} onClick={() => startNorthstarRun(policyId, () => setFocusPanel('result'))}>
        <span className="run-legend">{busy === 'northstar' ? <Spinner label="Solving…" /> : 'RUN NORTHSTAR AI'}</span>
        <span className="run-sub">constraint optimization · {policy?.name ?? policyId}{ns ? ' · done' : ''}</span>
      </button>
      <button type="button" className="btn act-baseline" disabled={disabled} onClick={() => void runBaseline().catch(() => undefined)}>
        {busy === 'baseline' ? <Spinner /> : <>Run baseline first<span className="act-sub">rule-based dispatch{runs.baseline ? ' · done' : ''}</span></>}
      </button>
      {!hasDisruptions && <p className="hint">Healthy network: pick a scenario on the left, or start the guided demo.</p>}
      {ns && ns.status !== 'OK' && <RunStatus run={ns} unservedReasons={decisions.filter((d) => d.status === 'unserved').map((d) => ({ id: d.mission_id, label: d.label, reason: d.reasons.find((r) => r.code === 'UNSERVED_BECAUSE')?.text ?? '' }))} />}
    </section>
  )
}
