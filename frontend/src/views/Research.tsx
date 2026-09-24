// Research page: the paired experiment told in order — question, method, headline,
// every scenario on every metric, where NORTHSTAR loses, censoring, policy
// sensitivity, solver accounting, the scenario explorer and how to reproduce it.
// Every number is read from /api/experiments/latest (experiments/results/summary.json).
import { useEffect, useMemo, type ReactNode } from 'react'
import { EXPERIMENTS_CSV_URL } from '../api/client'
import type { ExperimentSummary, MetricComparison, PolicyWeights, Stat } from '../api/types'
import { fmtMetric, fmtNumber, pValue, pct } from '../lib/format'
import { runExperimentCmd } from '../site/copy'
import { useStore } from '../state/store'
import { DiffStrip, SolverBar, WltBar } from './research/Charts'
import { OpenInSimulator, ScenarioExplorer } from './research/Explorer'
import { compactDescription, fmtDiff, median, pairedDiffs, solverBuckets, type PairedDiff } from './research/paired'

const QUESTION = 'Does constraint optimization make a remote air network more resilient than rule-based dispatch?'
/** Resilience metrics the headline may pick from; the three with the largest W − L margin are shown. */
const HEADLINE_POOL = ['disconnected_community_hours', 'passenger_delay_avg_min', 'disconnected_communities_end', 'medical_response_avg_min', 'cancelled_flights', 'recovery_time_min', 'cargo_delay_avg_min']
const H1 = 'medical_response_avg_min'
const LOSS_METRIC = 'disconnected_community_hours'
const policyName = (id: string) => id.replaceAll('_', ' ')
const COUNT_UNITS = new Set(['flights', 'communities', 'count'])
/** A mean of a count-like metric keeps one decimal (2.2 flights), other units use the metric formatter. */
const fmtMean = (k: string, v: number | null, c: { unit: string; label: string; direction: MetricComparison['direction'] }) =>
  v === null ? '—' : COUNT_UNITS.has(c.unit) ? fmtNumber(v, 1) : fmtMetric(k, v, c)

export function Research({ active }: { active: boolean }) {
  const exp = useStore((s) => s.experiments)
  const missing = useStore((s) => s.experimentsMissing)
  const error = useStore((s) => s.experimentsError)
  const load = useStore((s) => s.loadExperiments)
  useEffect(() => { if (active && !exp) void load() }, [active, exp, load])

  return (
    <article className="page research">
      <header className="page-head wrap" id="rs-question">
        <p className="eyebrow-brief">Research results · the question</p>
        <h1>{QUESTION}</h1>
        <p className="lead">What would count as an answer: a paired comparison. Every generated scenario is run twice from the same start, through the same simulator, scored by the same metric function, and every scenario where NORTHSTAR did worse stays in the count.</p>
        {exp && (
          <p className="rs-meta mono">
            {fmtNumber(exp.n_scenarios)} paired scenarios · seed {exp.seed} · policy {policyName(exp.primary_policy)} · commit {exp.git_commit ?? 'unknown'}{exp.git_dirty ? ' (uncommitted changes)' : ''} · generated {exp.generated_utc.slice(0, 10)} · OR-Tools {exp.ortools_version}
          </p>
        )}
      </header>

      {missing && (
        <div className="wrap">
          <div className="rs-state rs-empty" role="status">
            <h3>No experiment results on this machine yet</h3>
            <p>The Research page reads <code>experiments/results/summary.json</code>. Generate it (about 3–10 minutes on a laptop) from the repository root:</p>
            <pre>{runExperimentCmd()}</pre>
            <p>Then reload this page. The command is deterministic: the same seed reproduces the same CSV.</p>
            <button type="button" className="btn" onClick={() => void load()}>Check again</button>
          </div>
        </div>
      )}
      {error && !missing && (
        <div className="wrap">
          <div className="rs-state rs-empty danger" role="alert">
            <h3>Could not load the experiment summary</h3>
            <p>{error}</p>
            <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}
      {!exp && !missing && !error && <div className="wrap"><div className="rs-state rs-loading" role="status"><span className="spinner" /> Loading the experiment summary…</div></div>}
      {exp && <Story exp={exp} />}
    </article>
  )
}

function Sec({ id, eyebrow, title, lead, children, className = '' }: { id: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section id={id} className={`wrap rs-sec ${className}`} aria-labelledby={`${id}-h`}>
      <p className="eyebrow-brief">{eyebrow}</p>
      <h2 id={`${id}-h`}>{title}</h2>
      {lead && <p className="lead rs-lead">{lead}</p>}
      {children}
    </section>
  )
}

function Story({ exp }: { exp: ExperimentSummary }) {
  const pid = exp.primary_policy
  const comp = exp.comparisons[pid] ?? {}
  const keys = exp.primary_metrics.filter((k) => !!comp[k])
  const per = exp.per_scenario[pid] ?? []
  const diffs = useMemo(() => {
    const c = exp.comparisons[exp.primary_policy] ?? {}
    const rows = exp.per_scenario[exp.primary_policy] ?? []
    return Object.fromEntries(exp.primary_metrics.filter((k) => !!c[k]).map((k) => [k, pairedDiffs(rows, k, c[k])])) as Record<string, PairedDiff[]>
  }, [exp])
  return (
    <div className="rs-story">
      <Method exp={exp} nMetrics={keys.length} />
      <Headline exp={exp} comp={comp} />
      <Strips exp={exp} comp={comp} keys={keys} diffs={diffs} />
      <Losses exp={exp} comp={comp} diffs={diffs} />
      <Censoring exp={exp} />
      <Sensitivity exp={exp} comp={comp} keys={keys} />
      <Solver exp={exp} />
      <Sec id="rs-explorer" eyebrow="Scenario explorer" title={`All ${fmtNumber(per.length)} scenarios, one row each`} lead="Baseline → NORTHSTAR for every scenario. Click a metric header to sort (worst for NORTHSTAR first), type to filter by the disruption mix, and open any scenario in the simulator to re-run it live.">
        <ScenarioExplorer exp={exp} />
      </Sec>
      <Reproduce exp={exp} />
    </div>
  )
}

// ---- 2. Method --------------------------------------------------------------------

function Method({ exp, nMetrics }: { exp: ExperimentSummary; nMetrics: number }) {
  const hours = Math.round(exp.horizon_min / 60)
  const nodes = [
    { t: `${fmtNumber(exp.n_scenarios)} scenarios from seed ${exp.seed}`, p: 'Closures, severe weather, wildfire, aircraft failures, medevacs and cargo requests, drawn by a seeded generator; the fleet and the daily schedule are the same in every scenario.' },
    { t: 'Run twice from the same start', p: 'Once with the rule-based baseline, once with NORTHSTAR. Identical network, aircraft, schedule and events; neither sees the future.' },
    { t: 'Same simulator', p: `30-minute steps over a ${hours}-hour day, replanning at the same events for both: a mission released, a disruption starting or ending, an aircraft failing or becoming free.` },
    { t: 'Same metric function', p: `${nMetrics} primary metrics computed from the executed trace by one function. Missions not served by the horizon end are counted there, never dropped.` },
    { t: 'Paired comparison', p: 'Per metric: scenarios NORTHSTAR won, lost and tied, mean and median difference, and an exact two-sided sign test on the non-tied pairs.' },
  ]
  return (
    <Sec id="rs-method" eyebrow="Method" title="Same start, same simulator, same yardstick" lead="The comparison is paired so that the only difference between the two runs of a scenario is the dispatcher.">
      <ol className="method" aria-label="Method">
        {nodes.map((n) => <li key={n.t}><h3>{n.t}</h3><p>{n.p}</p><i aria-hidden /></li>)}
      </ol>
    </Sec>
  )
}

// ---- 3. Headline ------------------------------------------------------------------

function Headline({ exp, comp }: { exp: ExperimentSummary; comp: Record<string, MetricComparison> }) {
  const n = exp.n_scenarios
  const margin = (k: string) => comp[k].wins - comp[k].losses
  const ranked = HEADLINE_POOL.filter((k) => !!comp[k]).sort((a, b) => margin(b) - margin(a))
  const top = ranked.slice(0, 3)
  const next = ranked.slice(3, 5)
  const h1 = comp[H1]
  return (
    <Sec id="rs-headline" eyebrow="Headline" title="Three numbers, with their losses attached" lead={`Mean over ${fmtNumber(n)} scenarios, baseline → NORTHSTAR, and how many scenarios each side won. "Do nothing" is the published schedule flown with no response to events, on the same scenarios.`}>
      <div className="hl-grid">
        {top.map((k) => <HeadlineCard key={k} k={k} c={comp[k]} n={n} doNothing={exp.do_nothing[k]} />)}
      </div>
      <p className="rs-caption">
        Why these three: among the resilience metrics, they have the largest margin of scenarios won minus scenarios lost ({top.map((k) => `${margin(k)}`).join(', ')}).
        {next.length > 0 && <> Next in line: {next.map((k) => `${comp[k].label.toLowerCase()} (${comp[k].wins} / ${comp[k].losses} / ${comp[k].ties})`).join(' and ')}.</>}
        {h1 && !top.includes(H1) && <> {h1.label}, the first hypothesis, is {h1.wins} / {h1.losses} / {h1.ties}: in {h1.ties} scenarios both dispatchers reached the same response time, so it is in the strips below rather than here.</>}
        {' '}Every metric, including the one NORTHSTAR loses, follows.
      </p>
    </Sec>
  )
}

function HeadlineCard({ k, c, n, doNothing }: { k: string; c: MetricComparison; n: number; doNothing?: Stat }) {
  const imp = c.improvement_pct
  const better = imp !== null && imp > 0
  const word = imp === null ? '' : c.direction === 'lower' ? (better ? 'lower' : 'higher') : (better ? 'higher' : 'lower')
  const perScenario = c.unit === 'flights' || c.unit === 'communities' || c.unit === 'count'
  return (
    <article className="hl-card" aria-label={c.label}>
      <h3>{c.label}</h3>
      <p className="hl-pair"><span className="base">{fmtMean(k, c.baseline.mean, c)}</span><span className="arr">→</span><span className="ns">{fmtMean(k, c.northstar.mean, c)}</span></p>
      <p className="hl-pair-l">baseline → NORTHSTAR, mean{perScenario ? ' per scenario' : ''} · {c.direction === 'lower' ? 'lower is better' : 'higher is better'}</p>
      <p className={`hl-imp ${better ? '' : 'bad'}`}>{imp === null ? '—' : `${Math.abs(imp).toFixed(0)}%`}<span>{word} mean</span></p>
      <p className="hl-wlt"><b className="w">{c.wins}</b> NORTHSTAR better · <b className="t">{c.ties}</b> {c.ties === 1 ? 'tie' : 'ties'} · <b className="l">{c.losses}</b> baseline better</p>
      <WltBar wins={c.wins} losses={c.losses} ties={c.ties} n={n} />
      <p className="hl-foot mono">sign test {pValue(c.p_value)}{c.significant ? '' : ' (not significant)'}{doNothing && doNothing.mean !== null ? ` · do nothing ${fmtMean(k, doNothing.mean, c)}` : ''}</p>
    </article>
  )
}

// ---- 4. Every scenario, every metric ---------------------------------------------

function Strips({ exp, comp, keys, diffs }: { exp: ExperimentSummary; comp: Record<string, MetricComparison>; keys: string[]; diffs: Record<string, PairedDiff[]> }) {
  return (
    <Sec id="rs-strips" eyebrow="Every scenario, every metric" title="One tick per scenario. Left of zero, NORTHSTAR did better." lead={`NORTHSTAR minus baseline for each of the ${fmtNumber(exp.n_scenarios)} scenarios, on all ${keys.length} primary metrics. Each strip has its own scale, symmetric around zero. Losses are drawn in the warm colour and are never removed.`}>
      <div className="pd-legend mono" aria-label="Legend">
        <span><i className="w" />NORTHSTAR better</span>
        <span><i className="t" />tie (exact for counts, within 1 min for times, 0.5 km for distance)</span>
        <span><i className="l" />baseline better</span>
        <span><i className="m" />median</span>
      </div>
      <div className="pd-rows">
        {keys.map((k) => {
          const c = comp[k]
          const d = diffs[k] ?? []
          const med = median(d.map((x) => x.diff))
          return (
            <div key={k} className={`pd-row ${c.losses > c.wins ? 'lost' : ''}`}>
              <div className="pd-label">
                <h3>{c.label}<span className="unit">{c.unit} · {c.direction === 'lower' ? 'lower is better' : 'higher is better'}</span></h3>
                <p className="wlt mono"><b className="w">{c.wins}</b> W · <b className="t">{c.ties}</b> T · <b className="l">{c.losses}</b> L · median {fmtDiff(k, med, c)} · {pValue(c.p_value)}</p>
              </div>
              <DiffStrip k={k} c={c} diffs={d} />
            </div>
          )
        })}
      </div>
    </Sec>
  )
}

// ---- 5. Where NORTHSTAR loses ----------------------------------------------------

function Losses({ exp, comp, diffs }: { exp: ExperimentSummary; comp: Record<string, MetricComparison>; diffs: Record<string, PairedDiff[]> }) {
  const pid = exp.primary_policy
  const n = exp.n_scenarios
  const trade = (exp.tradeoffs[pid] ?? []).filter((k) => !!comp[k])
  const lossMetric = comp[LOSS_METRIC]
  const lossRows = (diffs[LOSS_METRIC] ?? []).filter((d) => d.outcome === 'loss').sort((a, b) => b.oriented - a.oriented)
  const w: PolicyWeights | undefined = exp.policy_weights?.[pid]
  const rr = comp.reroutes
  const title = trade.length
    ? `The baseline won more scenarios on ${trade.map((k) => comp[k].label.toLowerCase()).join(' and ')}`
    : 'No metric on which the baseline won more scenarios'
  return (
    <Sec id="rs-losses" eyebrow="Where NORTHSTAR loses" title={title} lead="Negative results stay in. These are the metrics on which the baseline won more scenarios than NORTHSTAR, and the individual scenarios where NORTHSTAR was worse on the headline connectivity metric.">
      {trade.length > 0 && (
        <ul className="trade-list">
          {trade.map((k) => (
            <li key={k}>
              <span className="tl-label">{comp[k].label}</span>
              <span className="tl-wlt mono"><b className="w">{comp[k].wins}</b> W · <b className="t">{comp[k].ties}</b> T · <b className="l">{comp[k].losses}</b> L of {n}</span>
              <span className="tl-means mono">mean {fmtMean(k, comp[k].baseline.mean, comp[k])} → {fmtMean(k, comp[k].northstar.mean, comp[k])} per scenario · {pValue(comp[k].p_value)}</span>
            </li>
          ))}
        </ul>
      )}
      {trade.includes('reroutes') && rr && (
        <p className="rs-caption">
          More reroutes are expected: NORTHSTAR re-plans at every event (a mission released, a disruption starting or ending, an aircraft failing or becoming free) and may move a mission to a different aircraft or path when that lowers the weighted total, while the baseline never revisits an assignment.
          {w && <> Each changed assignment costs {fmtNumber(w.w_reroute)} in the objective (the reroute penalty of the {policyName(pid)} profile); a change is made only when the rest of the objective gains more than that.</>}
          {' '}Mean per scenario: {fmtMean('reroutes', rr.baseline.mean, rr)} with the baseline, {fmtMean('reroutes', rr.northstar.mean, rr)} with NORTHSTAR.
        </p>
      )}
      {lossMetric && (
        <>
          <h3 className="rs-sub">Scenarios where NORTHSTAR was worse on {lossMetric.label.toLowerCase()} <span className="muted mono">{lossRows.length} of {n}</span></h3>
          {lossRows.length === 0 ? <p className="rs-caption">None in this run.</p> : (
            <table className="rs-table losses">
              <thead><tr><th>Scenario</th><th>Disruptions</th><th className="num">Baseline</th><th className="num">NORTHSTAR</th><th className="num">Difference</th><th><span className="th-unit">live</span></th></tr></thead>
              <tbody>
                {lossRows.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.id}</td>
                    <td className="desc" title={d.description}>{compactDescription(d.description)}</td>
                    <td className="num">{fmtMetric(LOSS_METRIC, d.baseline, lossMetric)}</td>
                    <td className="num l">{fmtMetric(LOSS_METRIC, d.northstar, lossMetric)}</td>
                    <td className="num l">{fmtDiff(LOSS_METRIC, d.diff, lossMetric)}</td>
                    <td className="act"><OpenInSimulator id={d.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="rs-caption">Open in simulator loads the generated scenario into the command centre; the run buttons there solve it live, so a loss can be inspected decision by decision rather than taken from this table.</p>
        </>
      )}
    </Sec>
  )
}

// ---- 6. Censoring -----------------------------------------------------------------

function Censoring({ exp }: { exp: ExperimentSummary }) {
  const cz = exp.censored[exp.primary_policy]
  if (!cz) return null
  const hours = Math.round(exp.horizon_min / 60)
  return (
    <Sec id="rs-censoring" eyebrow="Censoring and completeness" title="Unserved missions are counted, not dropped" lead={`A mission not served by the end of the ${hours}-hour horizon enters every average at the horizon-end value, for both strategies. This understates how bad an unserved medevac is, and it is applied identically to both.`}>
      <table className="rs-table censor">
        <thead><tr><th>Across all {fmtNumber(exp.n_scenarios)} scenarios</th><th className="num">Baseline</th><th className="num">NORTHSTAR</th></tr></thead>
        <tbody>
          <tr><td>Medevacs not served within {hours} h <span className="muted">(of {fmtNumber(cz.medical_missions_total)})</span></td><td className="num">{cz.medical_unserved_baseline}</td><td className="num">{cz.medical_unserved_northstar}</td></tr>
          <tr><td>Cargo requests not served <span className="muted">(of {fmtNumber(cz.cargo_missions_total)})</span></td><td className="num">{cz.cargo_unserved_baseline}</td><td className="num">{cz.cargo_unserved_northstar}</td></tr>
          <tr><td>Scheduled flights cancelled</td><td className="num">{fmtNumber(cz.cancelled_flights_baseline)}</td><td className="num">{fmtNumber(cz.cancelled_flights_northstar)}</td></tr>
        </tbody>
      </table>
      <p className="rs-caption">The censored counts sit behind the medical-response and cargo-delay means above: the averages include these missions at the horizon end, so the true gap for an unserved mission is larger than the number shown.</p>
    </Sec>
  )
}

// ---- 7. Policy sensitivity -------------------------------------------------------

type WeightValue = number | Record<string, number>
const fmtWeight = (v: WeightValue) => (typeof v === 'number' ? fmtNumber(v, 2) : Object.entries(v).map(([k, x]) => `${k}: ${fmtNumber(x, 2)}`).join(', '))

/** Weight keys where policy b differs from policy a, as "key a → b". */
function weightDiffs(a: PolicyWeights, b: PolicyWeights): string[] {
  const out: string[] = []
  for (const key of Object.keys(a) as (keyof PolicyWeights)[]) {
    const va = a[key] as WeightValue, vb = b[key] as WeightValue
    if (JSON.stringify(va) !== JSON.stringify(vb)) out.push(`${key} ${fmtWeight(va)} → ${fmtWeight(vb)}`)
  }
  return out
}

function Sensitivity({ exp, comp, keys }: { exp: ExperimentSummary; comp: Record<string, MetricComparison>; keys: string[] }) {
  if (exp.policies.length <= 1) return null
  const pid = exp.primary_policy
  // The metric on which the profiles disagree most, among those NORTHSTAR wins overall under the primary profile.
  let pick: { k: string; spread: number; lo: string; hi: string } | null = null
  for (const k of keys) {
    if (!comp[k].northstar_better_overall) continue
    const vals = exp.policies.map((p) => [p, exp.comparisons[p]?.[k]?.improvement_pct] as const).filter((x): x is readonly [string, number] => typeof x[1] === 'number')
    if (vals.length < 2) continue
    const lo = vals.reduce((m, x) => (x[1] < m[1] ? x : m)), hi = vals.reduce((m, x) => (x[1] > m[1] ? x : m))
    const spread = hi[1] - lo[1]
    if (!pick || spread > pick.spread) pick = { k, spread, lo: lo[0], hi: hi[0] }
  }
  const primaryW = exp.policy_weights?.[pid]
  return (
    <Sec id="rs-sensitivity" eyebrow="Policy sensitivity" title="Change the weights, and some answers change" lead={`The same ${fmtNumber(exp.n_scenarios)} scenarios were re-run under ${exp.policies.length - 1} other weight profiles. Improvement of the mean versus the baseline, with wins / losses / ties.`}>
      <div className="scroll-x">
        <table className="rs-table sens">
          <thead><tr><th>Metric</th>{exp.policies.map((p) => <th key={p} className={`num ${p === pid ? 'primary' : ''}`}>{policyName(p)}{p === pid ? ' · primary' : ''}</th>)}</tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}><td>{comp[k].label}</td>
                {exp.policies.map((p) => {
                  const c = exp.comparisons[p]?.[k]
                  const cls = c && c.improvement_pct !== null ? (c.improvement_pct > 0 ? 'good' : c.improvement_pct < 0 ? 'bad' : '') : ''
                  return <td key={p} className={`num mono ${cls}`}>{c ? `${pct(c.improvement_pct, 1)} (${c.wins}/${c.losses}/${c.ties})` : '—'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pick && (() => {
        const lo = exp.comparisons[pick.lo][pick.k], hi = exp.comparisons[pick.hi][pick.k]
        return (
          <p className="rs-caption">
            The weights change the answer on {comp[pick.k].label.toLowerCase()}: under {policyName(pick.hi)} the mean improves by {pct(hi.improvement_pct, 1)} ({hi.wins}/{hi.losses}/{hi.ties}, {pValue(hi.p_value)}{hi.significant ? '' : ', not significant'}); under {policyName(pick.lo)} by {pct(lo.improvement_pct, 1)} ({lo.wins}/{lo.losses}/{lo.ties}, {pValue(lo.p_value)}{lo.significant ? '' : ', not significant'}). The optimizer optimizes the same quantities the metrics measure; these runs exist to make that visible, not to hide it.
          </p>
        )
      })()}
      {primaryW && (
        <p className="sens-weights mono">
          {exp.policies.filter((p) => p !== pid).map((p) => {
            const d = exp.policy_weights[p] ? weightDiffs(primaryW, exp.policy_weights[p]) : []
            return <span key={p}><b>{policyName(p)}</b> differs from {policyName(pid)} in {d.length ? d.join(' · ') : 'no weight'}<br /></span>
          })}
        </p>
      )}
    </Sec>
  )
}

// ---- 8. Solver honesty -----------------------------------------------------------

function Solver({ exp }: { exp: ExperimentSummary }) {
  const pid = exp.primary_policy
  const so = exp.solver[pid]
  if (!so) return null
  const b = solverBuckets(so)
  const stats: { l: string; v: string; s?: string }[] = [
    { l: 'Replanning decisions', v: fmtNumber(b.calls), s: `across ${fmtNumber(exp.n_scenarios)} scenarios` },
    { l: 'CP-SAT solves', v: fmtNumber(b.cpsat), s: b.derived ? 'derived: optimal + feasible + time-outs' : 'a model was built and solved' },
    { l: 'Proven optimal', v: fmtNumber(b.optimal), s: b.cpsat ? `${((b.optimal / b.cpsat) * 100).toFixed(1)}% of solves` : undefined },
    { l: 'Feasible, not proven optimal', v: fmtNumber(b.feasible), s: 'solution found, limit reached' },
    { l: 'Time-outs', v: fmtNumber(b.timeout), s: 'no solution within the limit' },
    { l: 'No-feasible decisions', v: b.noFeasible === null ? 'not reported' : fmtNumber(b.noFeasible), s: 'explicit answer, no solve' },
    { l: 'Slowest solve', v: `${(so.max_wall_ms / 1000).toFixed(2)} s`, s: `${fmtNumber(so.max_wall_ms)} ms wall time` },
    { l: 'Mean run time', v: `${so.mean_run_wall_s.toFixed(2)} s`, s: 'per scenario, NORTHSTAR' },
    { l: 'Runs not OK', v: fmtNumber(so.runs_not_ok), s: 'status other than OK' },
    { l: 'Rejected assignments', v: fmtNumber(so.rejected_assignments), s: "by the simulator's feasibility check" },
  ]
  return (
    <Sec id="rs-solver" eyebrow="Solver honesty" title="Every replanning decision, accounted for" lead={`NORTHSTAR was called ${fmtNumber(so.calls)} times across the ${fmtNumber(exp.n_scenarios)} scenarios of the ${policyName(pid)} profile. Each call falls in exactly one of four buckets, and the buckets add up to the total.`}>
      <SolverBar b={b} />
      <dl className="solver-stats">
        {stats.map((s) => <div key={s.l}><dt>{s.l}</dt><dd>{s.v}{s.s && <small>{s.s}</small>}</dd></div>)}
      </dl>
      <p className="rs-caption">
        A no-feasible decision is a moment at which no usable aircraft could reach any pending mission (closed airports, range, runway or availability); the optimizer returns the explicit "no feasible solution" answer for that moment without building a model. It is expected in scenarios where a community is unreachable for a while and is not a solver failure.
        {b.derived && <> This summary predates the four-bucket accounting, so the no-feasible count is derived as decisions minus CP-SAT solves.</>}
        {' '}Solver settings: one worker, fixed seed, hard time limit of 10 s; a solve that reaches the limit is reported as such, never hidden.
      </p>
    </Sec>
  )
}

// ---- 10. Reproduce it ------------------------------------------------------------

function Reproduce({ exp }: { exp: ExperimentSummary }) {
  return (
    <Sec id="rs-reproduce" eyebrow="Reproduce it" title="Same seed, same numbers" lead="The experiment is deterministic: on the same commit, the same seed reproduces results.csv exactly.">
      <pre className="cmd">{runExperimentCmd(exp.n_scenarios, exp.seed)}</pre>
      <dl className="repro">
        <dt>Scenarios</dt><dd>{fmtNumber(exp.n_scenarios)} generated scenarios · master seed {exp.seed} · primary profile {policyName(exp.primary_policy)}</dd>
        <dt>Commit</dt><dd className="mono">{exp.git_commit ?? 'unknown'}{exp.git_dirty ? ' · the working tree had uncommitted changes' : ''}</dd>
        <dt>OR-Tools</dt><dd className="mono">{exp.ortools_version}</dd>
        <dt>Python · platform</dt><dd className="mono">{exp.python} · {exp.platform}</dd>
        <dt>Generated</dt><dd className="mono">{exp.generated_utc.replace('T', ' ').replace('Z', ' UTC')}</dd>
        <dt>Outputs</dt><dd><a href={EXPERIMENTS_CSV_URL}>Download results.csv</a> (one row per scenario, strategy and profile) · <code>experiments/results/summary.json</code> (what this page reads) · <code>experiments/results/scenarios.jsonl</code> (the scenarios themselves)</dd>
        <dt>Method</dt><dd><code>docs/DATA_AND_EXPERIMENT_METHODOLOGY.md</code>, written before the experiment was run: the null-result policy (§1), the metric definitions (§4), the generator (§6) and the protocol with the tie tolerance and the solver accounting (§7).</dd>
      </dl>
    </Sec>
  )
}
