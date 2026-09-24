import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricComparison, MetricInfo, Stat } from '../../api/types'
import { fmtMetric, pValue, pct } from '../../lib/format'

// Chart colours (validated with the dataviz palette checker against #10171f):
// NORTHSTAR teal is the emphasis hue, baseline is the de-emphasis grey.
export const CHART = {
  ns: '#17a99d', base: '#8a98a8', loss: '#d9734f', tie: '#3a4756',
  surface: '#10171f', ink: '#eef3f8', ink2: '#a9b6c4', ink3: '#6f8090', grid: '#233040',
}

interface TipPayload { payload: Record<string, unknown>; dataKey?: string | number; name?: string; value?: number | string }

function MiniTip({ active, payload, k, info }: { active?: boolean; payload?: TipPayload[]; k: string; info: MetricInfo }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as { name: string; v: number; median: number | null; std: number | null }
  return (
    <div className="chart-tip">
      <div className="tip-title">{p.name}</div>
      <div>mean <b>{fmtMetric(k, p.v, info)}</b></div>
      <div>median {fmtMetric(k, p.median, info)} · sd {fmtMetric(k, p.std, info)}</div>
    </div>
  )
}

/** One small multiple per metric: baseline vs NORTHSTAR mean, own scale. */
export function PairedMetricCard({ k, c, doNothing }: { k: string; c: MetricComparison; doNothing?: Stat }) {
  const info: MetricInfo = { label: c.label, unit: c.unit, direction: c.direction }
  const data = [
    { name: 'Baseline', v: c.baseline.mean ?? 0, median: c.baseline.median, std: c.baseline.std },
    { name: 'NORTHSTAR', v: c.northstar.mean ?? 0, median: c.northstar.median, std: c.northstar.std },
  ]
  const imp = c.improvement_pct
  const tone = imp === null || imp === 0 ? '' : imp > 0 ? 'good' : 'bad'
  return (
    <div className="mcard">
      <div className="mcard-label">{c.label}<span className="mcard-unit"> · {c.unit}, mean · {c.direction === 'lower' ? 'lower is better' : 'higher is better'}</span></div>
      <div className="mcard-top">
        <div className={`mcard-imp ${tone}`}>{imp === null ? '—' : `${imp > 0 ? '−' : imp < 0 ? '+' : ''}${Math.abs(imp).toFixed(1)}%`}</div>
        <div className="mcard-p">{imp !== null && (imp > 0 ? 'better with NORTHSTAR' : imp < 0 ? 'worse with NORTHSTAR' : 'no change')}<br />{pValue(c.p_value)}{c.significant ? ', significant' : ', not significant'}</div>
      </div>
      <div className="mcard-chart">
        <ResponsiveContainer width="100%" height={86}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, (max: number) => max * 1.05]} />
            <YAxis type="category" dataKey="name" width={78} tick={{ fill: CHART.ink2, fontSize: 11.5 }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<MiniTip k={k} info={info} />} />
            <Bar dataKey="v" isAnimationActive={false} maxBarSize={18} radius={[0, 4, 4, 0]}>
              <Cell fill={CHART.base} />
              <Cell fill={CHART.ns} />
              <LabelList dataKey="v" position="right" fill={CHART.ink} fontSize={12} formatter={(v) => fmtMetric(k, Number(v), info)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mcard-foot">
        <span>W / L / T <b>{c.wins} / {c.losses} / {c.ties}</b></span>
        {doNothing && doNothing.mean !== null && <span className="muted">do nothing {fmtMetric(k, doNothing.mean, info)}</span>}
      </div>
    </div>
  )
}

export interface WinLossRow { key: string; label: string; wins: number; losses: number; ties: number }

function SegLabel(props: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown }) {
  const w = Number(props.width), h = Number(props.height), x = Number(props.x), y = Number(props.y)
  const v = Number(props.value)
  if (!Number.isFinite(w) || w < 24 || !v) return null
  return <text x={x + w / 2} y={y + h / 2} dy={4} textAnchor="middle" fill="#fff" fontSize={11.5} fontWeight={700}>{v}</text>
}

function WLTip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as WinLossRow
  return (
    <div className="chart-tip">
      <div className="tip-title">{r.label}</div>
      <div><span className="sw-sq" style={{ background: CHART.ns }} /> NORTHSTAR better: <b>{r.wins}</b></div>
      <div><span className="sw-sq" style={{ background: CHART.tie }} /> tie: <b>{r.ties}</b></div>
      <div><span className="sw-sq" style={{ background: CHART.loss }} /> baseline better: <b>{r.losses}</b></div>
    </div>
  )
}

export function WinLossChart({ rows, n }: { rows: WinLossRow[]; n: number }) {
  const ticks = [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n]
  return (
    <ResponsiveContainer width="100%" height={rows.length * 34 + 56}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" domain={[0, n]} ticks={ticks} tick={{ fill: CHART.ink3, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={250} tick={{ fill: CHART.ink2, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip content={<WLTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend verticalAlign="top" align="right" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: CHART.ink2, paddingBottom: 8 }} />
        <Bar dataKey="wins" name="NORTHSTAR better" stackId="a" fill={CHART.ns} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} maxBarSize={20}>
          <LabelList dataKey="wins" content={SegLabel} />
        </Bar>
        <Bar dataKey="ties" name="Tie" stackId="a" fill={CHART.tie} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} maxBarSize={20}>
          <LabelList dataKey="ties" content={SegLabel} />
        </Bar>
        <Bar dataKey="losses" name="Baseline better" stackId="a" fill={CHART.loss} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} maxBarSize={20} radius={[0, 4, 4, 0]}>
          <LabelList dataKey="losses" content={SegLabel} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function pctCell(v: number | null): string { return pct(v, 1) }
