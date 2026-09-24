import { useEffect } from 'react'
import type { MetricComparison } from '../api/types'
import { pValue } from '../lib/format'
import { duration } from '../lib/time'
import { HREF } from '../router'
import { useStore } from '../state/store'
import { RUN_EXPERIMENT_CMD } from './copy'
import { Section } from './Section'

const KEYS = ['disconnected_community_hours', 'passenger_delay_avg_min', 'medical_response_avg_min', 'cancelled_flights']

function fmtMean(c: MetricComparison, v: number | null): string {
  if (v === null) return '—'
  if (c.unit === 'min') return duration(v)
  if (c.unit === 'h') return `${v.toFixed(1)} h`
  return v.toFixed(1)
}

export function Evidence() {
  const exp = useStore((s) => s.experiments)
  const missing = useStore((s) => s.experimentsMissing)
  const error = useStore((s) => s.experimentsError)
  const load = useStore((s) => s.loadExperiments)
  useEffect(() => { if (!exp && !missing) void load() }, [exp, missing, load])

  const n = exp?.n_scenarios ?? 100
  const seed = exp?.seed ?? 42
  const lead = `${n} generated disruption scenarios (fixed seed ${seed}), each run twice from an identical starting state: once with the rule-based baseline, once with NORTHSTAR. Same network, same disruptions, same feasibility rules, same metric function.`

  return (
    <Section id="evidence" eyebrow="Evidence" title="One scenario proves nothing. We ran one hundred." lead={lead}>
      {exp ? <Results /> : missing ? (
        <div className="ev-note" role="status">
          <p>The 100-scenario experiment has not been run on this machine yet. Generate it from the repository root (a few minutes on a laptop); the seed makes it reproducible.</p>
          <pre>{RUN_EXPERIMENT_CMD}</pre>
        </div>
      ) : error ? (
        <div className="ev-note" role="alert">
          <p>Could not load the experiment summary: {error}</p>
          <button type="button" className="btn" onClick={() => void load()}>Retry</button>
        </div>
      ) : (
        <div className="ev-note" role="status"><span className="spinner" /> Loading the experiment summary…</div>
      )}
      <p className="more-row"><a className="more" href={HREF.research}>See the full results →</a></p>
    </Section>
  )
}

function Results() {
  const exp = useStore((s) => s.experiments)!
  const comp = exp.comparisons[exp.primary_policy]
  const n = exp.n_scenarios
  const trade = (exp.tradeoffs[exp.primary_policy] ?? []).filter((k) => comp[k])
  return (
    <>
      <div className="ev-grid">
        {KEYS.filter((k) => comp[k]).map((k) => {
          const c = comp[k]
          const imp = c.improvement_pct
          const better = imp !== null && imp > 0
          const word = imp === null ? '' : c.direction === 'lower' ? (better ? 'lower' : 'higher') : (better ? 'higher' : 'lower')
          return (
            <article className="ev-card" key={k} aria-label={c.label}>
              <h3>{c.label}</h3>
              <p className={`ev-imp ${better ? '' : 'bad'}`}>
                <span className="num">{imp === null ? '—' : `${Math.abs(imp).toFixed(0)}%`}</span>
                <span className="imp-word">{word} mean</span>
              </p>
              <p className="ev-vals"><span className="base">{fmtMean(c, c.baseline.mean)}</span> → <span className="ns">{fmtMean(c, c.northstar.mean)}</span></p>
              <p className="ev-vals-l">baseline → NORTHSTAR, mean</p>
              <p className="ev-wins">Better in <b>{c.wins}</b> of {n} scenarios{c.ties ? ` · ${c.ties} ties` : ''}{c.losses ? ` · ${c.losses} losses` : ''}</p>
              <div className="ev-bar" aria-hidden>
                <span className="w" style={{ width: `${(c.wins / n) * 100}%` }} />
                <span className="t" style={{ width: `${(c.ties / n) * 100}%` }} />
                <span className="l" style={{ width: `${(c.losses / n) * 100}%` }} />
              </div>
              <p className="ev-p">sign test {pValue(c.p_value)}</p>
            </article>
          )
        })}
      </div>
      <aside className="ev-trade" aria-label="Trade-off">
        <p className="mono-label">Trade-off</p>
        {trade.length === 0 ? (
          <p>In this run the baseline did not win more scenarios than NORTHSTAR on any metric. That will not always be true; when it is not, it is reported here.</p>
        ) : trade.map((k) => (
          <p key={k}>
            NORTHSTAR does not win everything: on <b>{comp[k].label.toLowerCase()}</b> the baseline did better in <b>{comp[k].losses} of {n}</b> scenarios
            {k === 'reroutes' ? ', because NORTHSTAR reassigns aircraft more often.' : '.'}
          </p>
        ))}
      </aside>
    </>
  )
}
