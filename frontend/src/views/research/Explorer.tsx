// Scenario explorer: every generated scenario, baseline → NORTHSTAR per metric,
// sortable by clicking a metric header (worst for NORTHSTAR first), filterable by
// the disruption mix, and each row loadable into the simulator.
import { useMemo, useState } from 'react'
import type { ExperimentSummary } from '../../api/types'
import { Spinner } from '../../components/ui'
import { fmtMetric } from '../../lib/format'
import { useStore } from '../../state/store'
import { compactDescription, HEADLINE_COLS, pairedDiffs, type PairedDiff } from './paired'

/** Loads one generated scenario into the simulator session and goes there; the run buttons then solve it live. */
export function OpenInSimulator({ id }: { id: string }) {
  const open = useStore((s) => s.openExperimentScenario)
  const opening = useStore((s) => s.openingScenario)
  const busy = useStore((s) => s.busy)
  const connection = useStore((s) => s.connection)
  const me = opening === id
  return (
    <button
      type="button"
      className="btn small open-sim"
      disabled={connection === 'down' || opening !== null || (busy !== null && !me)}
      onClick={() => { open(id).catch(() => undefined) }}
      title="Load this generated scenario into the command centre; the run buttons there solve it live"
    >
      {me ? <><Spinner /> Opening…</> : 'Open in simulator'}
    </button>
  )
}

type Dir = 'worst' | 'best'

export function ScenarioExplorer({ exp }: { exp: ExperimentSummary }) {
  const pid = exp.primary_policy
  const comp = exp.comparisons[pid]
  const rows = useMemo(() => exp.per_scenario[exp.primary_policy] ?? [], [exp])
  const [cols, setCols] = useState<'headline' | 'all'>('headline')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(null)
  const keys = (cols === 'all' ? exp.primary_metrics : HEADLINE_COLS.filter((k) => exp.primary_metrics.includes(k))).filter((k) => !!comp[k])

  const diffIndex = useMemo(() => {
    const c = exp.comparisons[exp.primary_policy] ?? {}
    const m: Record<string, Map<string, PairedDiff>> = {}
    for (const k of exp.primary_metrics) if (c[k]) m[k] = new Map(pairedDiffs(rows, k, c[k]).map((d) => [d.id, d]))
    return m
  }, [rows, exp])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list = rows.filter((r) => !q || r.scenario_id.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || compactDescription(r.description).toLowerCase().includes(q))
    if (sort && diffIndex[sort.key]) {
      const idx = diffIndex[sort.key]
      list = [...list].sort((a, b) => {
        const da = idx.get(a.scenario_id)?.oriented ?? 0, db = idx.get(b.scenario_id)?.oriented ?? 0
        return (sort.dir === 'worst' ? db - da : da - db) || a.scenario_id.localeCompare(b.scenario_id)
      })
    }
    return list
  }, [rows, filter, sort, diffIndex])

  const clickSort = (k: string) => setSort((s) => (s?.key === k ? (s.dir === 'worst' ? { key: k, dir: 'best' } : null) : { key: k, dir: 'worst' }))

  return (
    <div className="explorer">
      <div className="explorer-tools">
        <input className="input" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by disruption mix, e.g. 2 aircraft failures" aria-label="Filter scenarios by description" />
        <div className="seg" role="group" aria-label="Metric columns">
          <button type="button" className={cols === 'headline' ? 'on' : ''} onClick={() => setCols('headline')}>Headline {HEADLINE_COLS.filter((k) => exp.primary_metrics.includes(k)).length}</button>
          <button type="button" className={cols === 'all' ? 'on' : ''} onClick={() => setCols('all')}>All {exp.primary_metrics.length} metrics</button>
        </div>
        <span className="explorer-count mono">{shown.length} of {rows.length} scenarios{sort ? ` · sorted by ${comp[sort.key]?.label.toLowerCase()}, ${sort.dir === 'worst' ? 'worst' : 'best'} for NORTHSTAR first` : ''}</span>
      </div>
      <div className="explorer-scroll">
        <table className="rs-table explorer">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Disruptions</th>
              {keys.map((k) => (
                <th key={k} className={sort?.key === k ? 'sorted' : ''} aria-sort={sort?.key === k ? (sort.dir === 'worst' ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" className="th-sort" onClick={() => clickSort(k)} title="Sort by NORTHSTAR − baseline">
                    {comp[k].label}<span className="sort-ind">{sort?.key === k ? (sort.dir === 'worst' ? ' ▼' : ' ▲') : ' ↕'}</span>
                  </button>
                  <span className="th-unit">baseline → NORTHSTAR · {comp[k].unit}</span>
                </th>
              ))}
              <th><span className="th-unit">live</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.scenario_id}>
                <td className="mono id">{r.scenario_id}</td>
                <td className="desc" title={r.description}>{compactDescription(r.description)}</td>
                {keys.map((k) => {
                  const d = diffIndex[k]?.get(r.scenario_id)
                  return (
                    <td key={k} className={`pair ${d?.outcome ?? ''}`} title={d ? `${d.outcome === 'tie' ? 'tie' : d.outcome === 'win' ? 'NORTHSTAR better' : 'baseline better'}` : undefined}>
                      {d ? <><span className="b">{fmtMetric(k, d.baseline, comp[k])}</span><span className="arr">→</span><span className="n">{fmtMetric(k, d.northstar, comp[k])}</span></> : '—'}
                    </td>
                  )
                })}
                <td className="act"><OpenInSimulator id={r.scenario_id} /></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={keys.length + 3} className="desc">No scenario matches “{filter}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
