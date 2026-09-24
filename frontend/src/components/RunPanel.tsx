import type { RunResult } from '../api/types'
import { fmtNumber, reasonText } from '../lib/format'
import { clock } from '../lib/time'
import { selectControlsDisabled, useStore } from '../state/store'
import { Expander, Spinner } from './ui'

/** Advanced-mode run controls: impact button, baseline, NORTHSTAR (through the run moment), policy profile and weights, diagnostics. */
export function RunPanel() {
  const policies = useStore((s) => s.policies)
  const policyId = useStore((s) => s.policyId)
  const setPolicyId = useStore((s) => s.setPolicyId)
  const runBaseline = useStore((s) => s.runBaseline)
  const startNorthstarRun = useStore((s) => s.startNorthstarRun)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
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
          {busy === 'impact' ? <Spinner label="Simulating…" /> : runs.do_nothing ? 'Impact (do nothing) ✓' : 'Show impact if nobody reacts'}
        </button>
        {!hasDisruptions && <span className="hint">Healthy network: runs will simply fly the schedule.</span>}
      </div>
      <button className="run-btn baseline" disabled={disabled} onClick={() => void runBaseline().catch(() => undefined)}>
        <span className="run-legend">{busy === 'baseline' ? <Spinner /> : 'RUN BASELINE'}</span>
        <span className="run-sub">rule-based dispatch{runs.baseline ? ' · done' : ''}</span>
      </button>
      <div className="run-ns-row">
        <button className="run-btn northstar" disabled={disabled} onClick={() => startNorthstarRun(policyId, () => setFocusPanel('compare'))}>
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
      {ns && <RunStatus run={ns} diagnostics unservedReasons={decisions.filter((d) => d.status === 'unserved').map((d) => ({ id: d.mission_id, label: d.label, reason: d.reasons.find((r) => r.code === 'UNSERVED_BECAUSE')?.text ?? reasonText((d.reasons[0]?.data?.reason as string) ?? '') }))} />}
      {runs.baseline && runs.baseline.status !== 'OK' && <RunStatus run={runs.baseline} unservedReasons={[]} />}
    </section>
  )
}

/** "2026-09-24T06:28:46Z" -> "2026-09-24 06:28:46 UTC" (the backend stamps in UTC; shown as such, never re-zoned). */
function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]} UTC` : iso
}

export function RunStatus({ run, unservedReasons, diagnostics = false }: { run: RunResult; unservedReasons: { id: string; label: string; reason: string }[]; diagnostics?: boolean }) {
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
  const firstCall = run.replans.find((r) => r.solver)?.solver
  const ms = run.compute_ms ?? null
  return (
    <div className={`state-card ${run.status === 'TIMEOUT' || run.status === 'PARTIAL' ? 'warn' : 'ns'}`}>
      <div className="status-line">
        <span className={`chip solid ${run.status === 'OK' ? 'ns' : 'warn'}`}>{run.status}</span>
        {solver && <span className="mono muted">{solver.calls} solver calls · {(solver.total_wall_ms / 1000).toFixed(1)} s · max {(solver.max_wall_ms / 1000).toFixed(1)} s</span>}
      </div>
      {diagnostics && (
        <div className="diag mono">
          {firstCall && (firstCall.workers !== undefined || firstCall.lookahead_min !== undefined) && (
            <div>{firstCall.workers !== undefined ? `${firstCall.workers} workers` : ''}{firstCall.workers !== undefined && firstCall.lookahead_min !== undefined ? ' · ' : ''}{firstCall.lookahead_min !== undefined ? `${firstCall.lookahead_min} min lookahead` : ''}</div>
          )}
          <div>
            {run.cached
              ? `computed by the engine at ${fmtWhen(run.computed_at)}${ms !== null ? ` in ${fmtNumber(ms)} ms` : ''} · served from cache`
              : `computed live${ms !== null ? ` in ${fmtNumber(ms)} ms` : ''}${run.computed_at ? ` at ${fmtWhen(run.computed_at)}` : ''}`}
          </div>
        </div>
      )}
      {(run.status === 'TIMEOUT' || run.status === 'PARTIAL' || nonOptimal.length > 0) && (
        <div className="warn-text">Solution found within the 10 s time limit, not proven optimal{nonOptimal.length ? ` (${nonOptimal.join(', ')})` : ''}.</div>
      )}
      {run.warnings.map((w) => <div key={w} className="warn-text">{w}</div>)}
      {reasons.length > 0 && (
        <ul>{reasons.map((r) => <li key={r.id} className="danger-text"><span className="mono">{r.id}</span> not served: {r.reason || 'no feasible aircraft'}</li>)}</ul>
      )}
      {diagnostics && run.replans.length > 0 && (
        <Expander label={<span>Replan log · {run.replans.length} moments</span>} className="replans">
          <ol className="replan-log mono">
            {run.replans.map((r, i) => (
              <li key={i}>
                <span className="t">{clock(r.t)}</span>
                <span className="trig">{r.triggers.map((x) => x.toLowerCase().replaceAll('_', ' ')).join(', ')}</span>
                <span className="n">{r.assignments} assigned{r.unserved ? ` · ${r.unserved} unserved` : ''}</span>
                {r.solver ? <span className={`chip ${r.solver.status === 'OPTIMAL' ? 'ns' : r.solver.status === 'NO_FEASIBLE_SOLUTION' ? 'base' : 'warn'}`}>{r.solver.status} {fmtNumber(r.solver.wall_ms)} ms</span> : <span className="muted">no solve</span>}
              </li>
            ))}
          </ol>
        </Expander>
      )}
    </div>
  )
}
