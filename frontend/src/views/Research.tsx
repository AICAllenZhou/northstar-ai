import { Fragment, useEffect } from 'react'
import { EXPERIMENTS_CSV_URL } from '../api/client'
import type { ExperimentSummary } from '../api/types'
import { fmtMetric, pValue, pct } from '../lib/format'
import { useStore } from '../state/store'
import { PairedMetricCard, WinLossChart } from './research/Charts'

const HEADLINE = ['medical_response_avg_min', 'disconnected_community_hours', 'cargo_delay_avg_min', 'passenger_delay_avg_min', 'recovery_time_min']
const RUN_CMD = 'cd backend && uv run python ../experiments/run_experiments.py --n 100 --seed 42'

export function Research({ active }: { active: boolean }) {
  const exp = useStore((s) => s.experiments)
  const missing = useStore((s) => s.experimentsMissing)
  const error = useStore((s) => s.experimentsError)
  const load = useStore((s) => s.loadExperiments)
  const policies = useStore((s) => s.policies)
  useEffect(() => { if (active && !exp) void load() }, [active, exp, load])

  return (
    <div className="research">
      <header className="rs-head">
        <div className="rs-title">
          <div className="eyebrow">Research results</div>
          <h2>Does constraint optimization make a remote air network more resilient than rule-based dispatch?</h2>
          <p>Paired experiment: every generated disruption scenario is run twice from the same start, once with the baseline dispatcher and once with NORTHSTAR. Same simulator, same metric function.</p>
        </div>
        {exp && <HeadlineStrip exp={exp} policyName={policies.find((p) => p.id === exp.primary_policy)?.name ?? exp.primary_policy} />}
      </header>

      {missing && (
        <div className="rs-empty">
          <h3>No experiment results on this machine yet</h3>
          <p>The Research view reads <code>experiments/results/summary.json</code>. Generate it (about 3–10 minutes on a laptop) from the repository root:</p>
          <pre>{RUN_CMD}</pre>
          <p>Then reload this view. The command is deterministic: the same seed reproduces the same CSV.</p>
          <button className="btn" onClick={() => void load()}>Check again</button>
        </div>
      )}
      {error && !missing && (
        <div className="rs-empty danger">
          <h3>Could not load the experiment summary</h3>
          <p>{error}</p>
          <button className="btn" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!exp && !missing && !error && <div className="rs-empty"><span className="spinner" /> Loading experiment summary…</div>}
      {exp && <Results exp={exp} />}
    </div>
  )
}

function HeadlineStrip({ exp, policyName }: { exp: ExperimentSummary; policyName: string }) {
  return (
    <div className="headline-strip">
      <div className="hstat"><div className="hstat-v">{exp.n_scenarios}</div><div className="hstat-l">paired scenarios</div></div>
      <div className="hstat"><div className="hstat-v">{exp.seed}</div><div className="hstat-l">random seed</div></div>
      <div className="hstat"><div className="hstat-v small">{policyName}</div><div className="hstat-l">primary policy</div></div>
      <div className="hstat"><div className="hstat-v small mono">{exp.git_commit ?? '—'}</div><div className="hstat-l">commit</div></div>
      <div className="hstat"><div className="hstat-v small mono">{exp.generated_utc.slice(0, 10)}</div><div className="hstat-l">generated · OR-Tools {exp.ortools_version}</div></div>
    </div>
  )
}

function Results({ exp }: { exp: ExperimentSummary }) {
  const pid = exp.primary_policy
  const comp = exp.comparisons[pid]
  const keys = exp.primary_metrics.filter((k) => comp[k])
  const rows = keys.map((k) => ({ key: k, label: comp[k].label, wins: comp[k].wins, losses: comp[k].losses, ties: comp[k].ties }))
  const tradeoffs = exp.tradeoffs[pid] ?? []
  const cz = exp.censored[pid]
  const so = exp.solver[pid]
  const per = exp.per_scenario[pid] ?? []
  return (
    <>
      <section className="rs-section">
        <h3>Headline metrics <span className="muted">· mean over {exp.n_scenarios} scenarios, baseline vs NORTHSTAR</span></h3>
        <div className="metric-cards">
          {HEADLINE.filter((k) => comp[k]).map((k) => <PairedMetricCard key={k} k={k} c={comp[k]} doNothing={exp.do_nothing[k]} />)}
        </div>
      </section>

      <section className="rs-section two-col">
        <div className="card">
          <h3>Who won each scenario? <span className="muted">· per metric, {exp.n_scenarios} paired runs</span></h3>
          <WinLossChart rows={rows} n={exp.n_scenarios} />
          <details className="table-view"><summary>Table view</summary>
            <table className="rs-table"><thead><tr><th>Metric</th><th>NORTHSTAR better</th><th>Tie</th><th>Baseline better</th><th>p (sign test)</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.wins}</td><td>{r.ties}</td><td>{r.losses}</td><td>{pValue(comp[r.key].p_value)}</td></tr>)}</tbody></table>
          </details>
        </div>
        <div className="side-col">
          <div className={`card callout ${tradeoffs.length ? 'warn' : 'ok'}`}>
            <h3>Trade-offs</h3>
            <p className="muted">Metrics on which the <b>baseline</b> won more scenarios than NORTHSTAR.</p>
            {tradeoffs.length === 0 ? (
              <p className="big-none">None.</p>
            ) : (
              <ul>{tradeoffs.map((k) => <li key={k}><b>{comp[k].label}</b>: baseline better in {comp[k].losses}, NORTHSTAR in {comp[k].wins}, tie in {comp[k].ties}.</li>)}</ul>
            )}
            <p className="muted small">Negative results are not removed. Per-metric losses are visible in the chart even when the mean improves.</p>
          </div>
          <div className="card">
            <h3>Censoring</h3>
            <p>Missions not served by the end of the 24 h horizon are counted at the horizon end for both strategies, which understates how bad an unserved medevac is.</p>
            <table className="rs-table compact">
              <thead><tr><th /><th>Baseline</th><th>NORTHSTAR</th></tr></thead>
              <tbody>
                <tr><td>Medevacs unserved (of {cz.medical_missions_total})</td><td>{cz.medical_unserved_baseline}</td><td>{cz.medical_unserved_northstar}</td></tr>
                <tr><td>Cargo requests unserved (of {cz.cargo_missions_total})</td><td>{cz.cargo_unserved_baseline}</td><td>{cz.cargo_unserved_northstar}</td></tr>
                <tr><td>Scheduled flights cancelled</td><td>{cz.cancelled_flights_baseline}</td><td>{cz.cancelled_flights_northstar}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Solver</h3>
            <p className="mono small">{so.calls.toLocaleString('en-CA')} CP-SAT calls · {so.optimal_calls.toLocaleString('en-CA')} proven optimal · {so.feasible_not_optimal_calls} feasible-not-optimal · {so.timeout_calls} time-outs · max {(so.max_wall_ms / 1000).toFixed(1)} s · mean run {so.mean_run_wall_s} s · {so.runs_not_ok} runs not OK · {so.rejected_assignments} rejected assignments</p>
          </div>
        </div>
      </section>

      {exp.policies.length > 1 && (
        <section className="rs-section">
          <h3>Sensitivity to the policy profile <span className="muted">· improvement of the mean vs baseline (W/L/T)</span></h3>
          <div className="scroll-x">
            <table className="rs-table">
              <thead><tr><th>Metric</th>{exp.policies.map((p) => <th key={p}>{p.replaceAll('_', ' ')}</th>)}</tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}><td>{comp[k].label}</td>
                    {exp.policies.map((p) => { const c = exp.comparisons[p]?.[k]; return <td key={p} className={c && c.improvement_pct !== null ? (c.improvement_pct > 0 ? 'good' : c.improvement_pct < 0 ? 'bad' : '') : ''}>{c ? `${pct(c.improvement_pct, 1)} (${c.wins}/${c.losses}/${c.ties})` : '—'}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Weights per profile are declared in <code>backend/northstar/config.py</code> and returned by <code>/api/policies</code>. The optimizer optimizes the same quantities the metrics measure; these runs exist to make that visible.</p>
        </section>
      )}

      <section className="rs-section">
        <h3>Per-scenario rows <span className="muted">· {per.length} scenarios, headline metrics</span> <a className="csv-link" href={EXPERIMENTS_CSV_URL}>Download results.csv</a></h3>
        <div className="scroll-x scroll-y">
          <table className="rs-table per-scenario">
            <thead>
              <tr><th>Scenario</th><th>Disruptions</th>{HEADLINE.map((k) => <th key={k} colSpan={2}>{comp[k]?.label ?? k}</th>)}</tr>
              <tr><th /><th />{HEADLINE.map((k) => <Fragment key={k}><th className="sub base">baseline</th><th className="sub ns">NORTHSTAR</th></Fragment>)}</tr>
            </thead>
            <tbody>
              {per.map((r) => (
                <tr key={r.scenario_id}>
                  <td className="mono">{r.scenario_id}</td>
                  <td className="desc">{r.description}</td>
                  {HEADLINE.map((k) => {
                    const b = r[`baseline_${k}`], n = r[`northstar_${k}`]
                    const info = comp[k]
                    const bn = typeof b === 'number' ? b : null, nn = typeof n === 'number' ? n : null
                    const cls = bn === null || nn === null || bn === nn ? '' : (info.direction === 'lower' ? nn < bn : nn > bn) ? 'good' : 'bad'
                    return <Fragment key={k}><td className="num">{fmtMetric(k, bn, info)}</td><td className={`num ${cls}`}>{fmtMetric(k, nn, info)}</td></Fragment>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rs-section how">
        <h3>How we tested NORTHSTAR</h3>
        <p>{exp.n_scenarios} disruption scenarios were generated from a fixed random seed ({exp.seed}). Each scenario was run twice from an identical starting state: once with a simple rule-based dispatcher (nearest free compatible aircraft, shortest open route, retry when an aircraft frees up) and once with NORTHSTAR (OR-Tools CP-SAT constraint optimization). Both runs use the same simulator and the same metric function. Missions not served by the end of the 24-hour horizon are counted at the horizon end for both strategies. We report means, medians, how many scenarios each strategy won, and a sign-test p-value; we do not remove scenarios where NORTHSTAR did worse.</p>
        <p className="muted small">Fleet, schedule, demand and disruptions are synthetic; geography, runways and populations are real. Nothing here is a claim about real airline performance. Details: <code>docs/DATA_AND_EXPERIMENT_METHODOLOGY.md</code>.</p>
      </section>
    </>
  )
}
