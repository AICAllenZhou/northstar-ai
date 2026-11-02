// Pure helpers for the Research page (no components, so Fast Refresh stays happy):
// paired differences per scenario, tie tolerance, median, signed formatting and
// the solver bucket accounting. (The compact disruption description lives in
// lib/humanize so the command centre can use it too.)
import type { MetricComparison, PerScenarioRow, SolverStats } from '../../api/types'
import { fmtMetric } from '../../lib/format'
import { duration } from '../../lib/time'

export type Outcome = 'win' | 'loss' | 'tie'

export interface PairedDiff {
  id: string
  description: string
  baseline: number
  northstar: number
  /** NORTHSTAR − baseline in the metric's own unit. */
  diff: number
  /** diff signed so that negative always means NORTHSTAR better (flipped for higher-is-better metrics). */
  oriented: number
  outcome: Outcome
}

/** Tie tolerance of the experiment runner (methodology §7): exact for counts, 1 minute for times, 0.5 km for distance. */
export function tieTolerance(unit: string): number {
  return unit === 'min' ? 1 : unit === 'km' ? 0.5 : 0
}

/** One paired difference per scenario for metric k; rows without both values are skipped. */
export function pairedDiffs(rows: PerScenarioRow[], k: string, c: MetricComparison): PairedDiff[] {
  const tol = tieTolerance(c.unit)
  const out: PairedDiff[] = []
  for (const r of rows) {
    const b = r[`baseline_${k}`], n = r[`northstar_${k}`]
    if (typeof b !== 'number' || typeof n !== 'number') continue
    const diff = n - b
    const oriented = c.direction === 'higher' ? -diff : diff
    const outcome: Outcome = Math.abs(diff) <= tol ? 'tie' : oriented < 0 ? 'win' : 'loss'
    out.push({ id: r.scenario_id, description: r.description, baseline: b, northstar: n, diff, oriented, outcome })
  }
  return out
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Signed difference with its unit: "−18.0 h", "+3h30", "−2", "±0". */
export function fmtDiff(k: string, v: number | null, c: { unit: string }): string {
  if (v === null || Number.isNaN(v)) return '—'
  if (v === 0) return '±0'
  const sign = v < 0 ? '−' : '+'
  if (c.unit === 'min') return sign + duration(Math.abs(v))
  return sign + fmtMetric(k, Math.abs(v), { label: '', unit: c.unit, direction: 'lower' })
}

export interface Buckets {
  calls: number
  cpsat: number
  optimal: number
  feasible: number
  timeout: number
  /** null when the summary predates the four-bucket accounting and the remainder would be negative. */
  noFeasible: number | null
  /** True when cpsat_calls / no_feasible_calls were not in the summary and had to be derived. */
  derived: boolean
  /** True when the four buckets add up to `calls`. */
  sums: boolean
}

/** The four buckets, tolerant of older summaries that only carried the first three. */
export function solverBuckets(so: SolverStats): Buckets {
  const cpsat = so.cpsat_calls ?? (so.optimal_calls + so.feasible_not_optimal_calls + so.timeout_calls)
  const remainder = so.calls - cpsat
  const noFeasible = so.no_feasible_calls ?? (remainder >= 0 ? remainder : null)
  const sum = so.optimal_calls + so.feasible_not_optimal_calls + so.timeout_calls + (noFeasible ?? 0)
  return {
    calls: so.calls, cpsat, optimal: so.optimal_calls, feasible: so.feasible_not_optimal_calls, timeout: so.timeout_calls, noFeasible,
    derived: so.cpsat_calls === undefined || so.no_feasible_calls === undefined, sums: sum === so.calls,
  }
}

/** The six resilience metrics the explorer shows by default: the five headline ones plus reroutes / reassignments,
 *  the column where NORTHSTAR loses. "All" adds the rest of the primary list. */
export const RESILIENCE_COLS = ['disconnected_community_hours', 'passenger_delay_avg_min', 'medical_response_avg_min', 'cargo_delay_avg_min', 'cancelled_flights', 'reroutes']
