// Simulation times are minutes after 06:00 local. The horizon is 24 h.
export const CLOCK_START_MIN = 6 * 60
export const HORIZON_MIN = 1440
export const STEP_MIN = 30

/** 0 -> "06:00", 750 -> "18:30", 1440 -> "06:00" (+1d) */
export function clock(min: number | null | undefined, withDay = false): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—'
  const total = CLOCK_START_MIN + Math.round(min)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  const s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return withDay && total >= 24 * 60 ? `${s} +1d` : s
}

/** 90 -> "1h30", 45 -> "45 min", 0 -> "0 min" */
export function duration(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—'
  const m = Math.round(Math.abs(min))
  const sign = min < 0 ? '−' : ''
  if (m < 60) return `${sign}${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${sign}${h}h` : `${sign}${h}h${String(r).padStart(2, '0')}`
}

/** Signed short duration for deltas: -55 -> "−55 min", +210 -> "+3h30" */
export function signedDuration(min: number): string {
  if (min === 0) return '±0'
  return (min > 0 ? '+' : '−') + duration(Math.abs(min))
}

export function snapshotIndex(t: number, step = STEP_MIN): number {
  return Math.max(0, Math.min(HORIZON_MIN / step, Math.floor(t / step)))
}
