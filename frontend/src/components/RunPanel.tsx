import type { RunResult } from '../api/types'
import { reasonText } from '../lib/format'
import { selectControlsDisabled, useStore } from '../state/store'
import { Expander, Spinner } from './ui'

export function RunPanel() {
  const policies = useStore((s) => s.policies)
  const policyId = useStore((s) => s.policyId)
  const setPolicyId = useStore((s) => s.setPolicyId)
  const runBaseline = useStore((s) => s.runBaseline)
  const runNorthstar = useStore((s) => s.runNorthstar)
  const fetchImpact = useStore((s) => s.fetchImpact)
  const busy = useStore((s) => s.busy)
  const disabled = useStore(selectControlsDisabled)
  const runs = useStore((s) => s.runs)
  const decisions = useStore((s) => s.decisions)
  const hasDisruptions = useStore((s) => (s.scenario?.scenario.disruptions.length ?? 0) > 0)
  const policy = policies.find((p) => p.id === policyId)
  const ns = runs.northstar

  return (
    <section className="panel run-panel">
      <div className="run-row">
        <button className="btn ghost small" disabled={disabled} onClick={() => void fetchImpact(true).catch(() => undefined)} title="Simulate the day with the published schedule only">
          {busy === 'impact' ? <Spinner label="Simulating…" /> : runs.do_nothing ? 'Impact (do nothing) ✓' : 'Show impact · do nothing'}
        </button>
        {!hasDisruptions && <span className="hint">Healthy network: runs will simply fly the schedule.</span>}
      </div>
      <button className="run-btn baseline" disabled={disabled} onClick={() => void runBaseline().catch(() => undefined)}>
        <span className="run-legend">{busy === 'baseline' ? <Spinner /> : 'RUN BASELINE'}</span>
        <span className="run-sub">rule-based dispatch{runs.baseline ? ' · done' : ''}</span>
      </button>
      <div className="run-ns-row">
        <button className="run-btn northstar" disabled={disabled} onClick={() => void runNorthstar(policyId).catch(() => undefined)}>
          <span className="run-legend">{busy === 'northstar' ? <Spinner label="Solving…" /> : 'RUN NORTHSTAR AI'}</span>
          <span className="run-sub">OR-Tools CP-SAT · {policy?.name ?? policyId}{ns ? ' · done' : ''}</span>
        </button>
        <div className="policy-box">
          <label className="eyebrow" htmlFor="policy">Profile</label>
          <select id="policy" className="input" value={policyId} disabled={disabled} onChange={(e) => setPolicyId(e.target.value)} title={policy?.description}>
            {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      {policy && (
        <Expander label={<span>Objective weights · {policy.description}</span>} className="weights">
          <table className="weights-table">
            <tbody>
              <tr><td>Medical response, per min (P1 / P2 / P3)</td><td className="mono">{Object.values(policy.weights.w_medical_per_min).join(' / ')}</td></tr>
              <tr><td>Cargo late, per min</td><td className="mono">{policy.weights.w_cargo_late_per_min}</td></tr>
              <tr><td>Cargo request→delivery, per min</td><td className="mono">{policy.weights.w_cargo_time_per_min}</td></tr>
              <tr><td>Passenger late, per min</td><td className="mono">{policy.weights.w_passenger_late_per_min}</td></tr>
              <tr><td>Disconnected community, per min</td><td className="mono">{policy.weights.w_connectivity_per_min}</td></tr>
              <tr><td>Unserved penalty (med / cargo / pax)</td><td className="mono">{Object.values(policy.weights.pen_unserved).map((v) => v.toLocaleString('en-CA')).join(' / ')}</td></tr>
              <tr><td>Distance, per km × cost index</td><td className="mono">{policy.weights.w_distance_per_km_index}</td></tr>
              <tr><td>Path risk, per unit</td><td className="mono">{policy.weights.w_risk}</td></tr>
              <tr><td>Changing an assignment</td><td className="mono">{policy.weights.w_reroute}</td></tr>
              <tr><td>Risk path weight λ</td><td className="mono">{policy.weights.risk_path_lambda}</td></tr>
            </tbody>
          </table>
        </Expander>
      )}
      {ns && <RunStatus run={ns} unservedReasons={decisions.filter((d) => d.status === 'unserved').map((d) => ({ id: d.mission_id, label: d.label, reason: d.reasons.find((r) => r.code === 'UNSERVED_BECAUSE')?.text ?? reasonText((d.reasons[0]?.data?.reason as string) ?? '') }))} />}
      {runs.baseline && runs.baseline.status !== 'OK' && <RunStatus run={runs.baseline} unservedReasons={[]} />}
    </section>
  )
}

function RunStatus({ run, unservedReasons }: { run: RunResult; unservedReasons: { id: string; label: string; reason: string }[] }) {
  const unserved = run.assignments.filter((a) => a.status === 'unserved' && a.type !== 'passenger')
  const reasons = unservedReasons.length ? unservedReasons : unserved.map((a) => ({ id: a.mission_id, label: a.label, reason: reasonText(a.infeasible_reason) }))
  const name = run.strategy === 'northstar' ? 'NORTHSTAR' : run.strategy
  if (run.status === 'NO_FEASIBLE_SOLUTION') {
    return (
      <div className="state-card danger" role="alert">
        <h4>No feasible solution</h4>
        <div>{name} could not assign any aircraft to the outstanding missions. Metrics are shown censored at the horizon end.</div>
        {reasons.length > 0 && <ul>{reasons.map((r) => <li key={r.id}><span className="mono">{r.id}</span> {r.label}: {r.reason || 'no feasible aircraft'}</li>)}</ul>}
      </div>
    )
  }
  const solver = run.solver
  const nonOptimal = solver ? solver.statuses.filter((s) => s !== 'OPTIMAL' && s !== 'NO_FEASIBLE_SOLUTION') : []
  return (
    <div className={`state-card ${run.status === 'TIMEOUT' || run.status === 'PARTIAL' ? 'warn' : 'ns'}`}>
      <div className="status-line">
        <span className={`chip solid ${run.status === 'OK' ? 'ns' : 'warn'}`}>{run.status}</span>
        {solver && <span className="mono muted">{solver.calls} solver calls · {(solver.total_wall_ms / 1000).toFixed(1)} s · max {(solver.max_wall_ms / 1000).toFixed(1)} s</span>}
      </div>
      {(run.status === 'TIMEOUT' || run.status === 'PARTIAL' || nonOptimal.length > 0) && (
        <div className="warn-text">Solution found within the 10 s time limit, not proven optimal{nonOptimal.length ? ` (${nonOptimal.join(', ')})` : ''}.</div>
      )}
      {run.warnings.map((w) => <div key={w} className="warn-text">{w}</div>)}
      {reasons.length > 0 && (
        <ul>{reasons.map((r) => <li key={r.id} className="danger-text"><span className="mono">{r.id}</span> not served: {r.reason || 'no feasible aircraft'}</li>)}</ul>
      )}
    </div>
  )
}
