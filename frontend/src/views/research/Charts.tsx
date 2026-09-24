// Chart components for the Research page, plain SVG/CSS (no chart library):
// the per-scenario paired-difference strip, the W/L/T bar and the solver bucket bar.
// Every number drawn here comes from /api/experiments/latest; the arithmetic lives in paired.ts.
import type { MetricComparison } from '../../api/types'
import { fmtMetric, fmtNumber } from '../../lib/format'
import { CHART } from './chartTheme'
import { fmtDiff, median, type Buckets, type Outcome, type PairedDiff } from './paired'

/** Thin three-segment bar: NORTHSTAR better · tie · baseline better. */
export function WltBar({ wins, losses, ties, n }: { wins: number; losses: number; ties: number; n: number }) {
  const total = Math.max(1, n)
  return (
    <div className="wlt-bar" role="img" aria-label={`${wins} NORTHSTAR better, ${ties} ties, ${losses} baseline better`}>
      <span className="w" style={{ width: `${(wins / total) * 100}%` }} />
      <span className="t" style={{ width: `${(ties / total) * 100}%` }} />
      <span className="l" style={{ width: `${(losses / total) * 100}%` }} />
    </div>
  )
}

const W = 800, H = 44, PAD = 12, LANES = 6, TICK_W = 1.8, TICK_H = 5, LANE_GAP = 1
const COLOR: Record<Outcome, string> = { win: CHART.ns, loss: CHART.loss, tie: CHART.tie }

/** One tick per scenario at NORTHSTAR − baseline, oriented so that left of zero is NORTHSTAR better.
 *  Own symmetric scale per metric; ticks that land on the same pixel column stack across lanes so
 *  overlaps are visible instead of hidden. Hover a tick for the scenario. */
export function DiffStrip({ k, c, diffs }: { k: string; c: MetricComparison; diffs: PairedDiff[] }) {
  const values = diffs.map((d) => d.oriented)
  const D = Math.max(...values.map(Math.abs), Number.EPSILON)
  const half = W / 2 - PAD
  const x = (v: number) => W / 2 + (v / D) * half
  const binCount = new Map<number, number>()
  const placed = diffs.map((d) => {
    const px = x(d.oriented)
    const bin = Math.round(px / 3)
    const i = binCount.get(bin) ?? 0
    binCount.set(bin, i + 1)
    return { d, px, lane: i % LANES }
  })
  const med = median(values)
  const top = (H - (LANES * (TICK_H + LANE_GAP) - LANE_GAP)) / 2
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const mag = (v: number) => fmtDiff(k, Math.abs(v), c).replace(/^[+−]/, '')
  const tip = (d: PairedDiff) => d.outcome === 'tie'
    ? `${d.id} · tie: baseline ${fmtMetric(k, d.baseline, c)}, NORTHSTAR ${fmtMetric(k, d.northstar, c)}`
    : `${d.id} · baseline ${fmtMetric(k, d.baseline, c)} → NORTHSTAR ${fmtMetric(k, d.northstar, c)} (${fmtDiff(k, d.diff, c)}, ${d.outcome === 'win' ? 'NORTHSTAR better' : 'baseline better'})`
  return (
    <div className="pd-strip">
      <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${c.label}: ${diffs.length} scenarios, ${c.wins} NORTHSTAR better, ${c.ties} ties, ${c.losses} baseline better`}>
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke={CHART.ink3} strokeWidth={1} />
        {placed.map(({ d, px, lane }) => (
          <rect key={d.id} x={px - TICK_W / 2} y={top + lane * (TICK_H + LANE_GAP)} width={TICK_W} height={TICK_H} fill={COLOR[d.outcome]} opacity={d.outcome === 'tie' ? 1 : 0.9}>
            <title>{tip(d)}</title>
          </rect>
        ))}
        {med !== null && <rect x={x(med) - 1} y={H - 8} width={2} height={8} fill={CHART.ink}><title>median {fmtDiff(k, med, c)}</title></rect>}
      </svg>
      <div className="pd-axis mono" aria-hidden>
        <span className="win">{min < 0 ? `◀ NORTHSTAR better by up to ${mag(min)}` : 'no scenario where NORTHSTAR was better'}</span>
        <span>0</span>
        <span className="loss">{max > 0 ? `baseline better by up to ${mag(max)} ▶` : 'no scenario where the baseline was better'}</span>
      </div>
    </div>
  )
}

/** One stacked bar whose four segments visibly sum to the total number of replanning decisions. */
export function SolverBar({ b }: { b: Buckets }) {
  const segs = [
    { key: 'optimal', label: 'proven optimal', v: b.optimal, color: CHART.ns },
    { key: 'feasible', label: 'feasible, not proven optimal', v: b.feasible, color: '#ffb020' },
    { key: 'timeout', label: 'time-outs', v: b.timeout, color: CHART.loss },
    { key: 'nofeasible', label: 'no feasible solution, no solve', v: b.noFeasible ?? 0, color: CHART.base },
  ]
  const total = Math.max(1, b.calls)
  return (
    <div className="solver-bar-wrap">
      <div className="solver-bar" role="img" aria-label={segs.map((s) => `${s.v} ${s.label}`).join(', ')}>
        {segs.filter((s) => s.v > 0).map((s) => (
          <span key={s.key} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} title={`${s.label}: ${fmtNumber(s.v)}`}>{s.v / total >= 0.05 ? fmtNumber(s.v) : ''}</span>
        ))}
      </div>
      <ul className="solver-legend">
        {segs.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.key === 'nofeasible' && b.noFeasible === null ? 'not reported' : fmtNumber(s.v)} {s.label}</li>)}
        <li className={`sum ${b.sums ? 'ok' : 'bad'}`}>{b.sums ? '= ' : '≠ '}{fmtNumber(b.calls)} replanning decisions</li>
      </ul>
    </div>
  )
}
