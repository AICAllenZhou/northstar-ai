import type { MetricInfo, Metrics } from '../api/types'
import { duration } from './time'

export function fmtNumber(v: number, digits = 0): string {
  return v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Short value with unit for a metric cell. */
export function fmtMetric(key: string, v: number | null | undefined, info?: MetricInfo): string {
  if (v === null || v === undefined) return '—'
  const unit = info?.unit ?? ''
  if (unit === 'min') return duration(v)
  if (unit === 'h') return `${fmtNumber(v, 1)} h`
  if (unit === '%') return `${fmtNumber(v, 0)}%`
  if (unit === 'km') return `${fmtNumber(v, 0)} km`
  if (unit === 'communities' || unit === 'flights' || unit === 'count') return fmtNumber(v, key.includes('avg') ? 1 : 0)
  return fmtNumber(v, 1)
}

export interface CellValue {
  text: string
  sub?: string
  censored: boolean
}

/** Metric cell with censoring: unserved missions are counted at the horizon end,
 *  so an average that includes them is shown as "not served (n)" instead. */
export function metricCell(key: string, m: Metrics | undefined, info?: MetricInfo): CellValue {
  if (!m) return { text: '—', censored: false }
  const raw = (m as unknown as Record<string, number | null | boolean>)[key]
  const v = typeof raw === 'number' ? raw : null
  if (key === 'medical_response_avg_min' && m.medical_unserved > 0) {
    return { text: `not served (${m.medical_unserved})`, sub: m.medical_count > m.medical_unserved ? `censored ${fmtMetric(key, v, info)}` : `of ${m.medical_count}`, censored: true }
  }
  if (key === 'cargo_delay_avg_min' && m.cargo_unserved > 0) {
    return { text: `not served (${m.cargo_unserved})`, sub: m.cargo_count > m.cargo_unserved ? `censored ${fmtMetric(key, v, info)}` : `of ${m.cargo_count}`, censored: true }
  }
  if (key === 'recovery_time_min' && !m.recovered) {
    return { text: 'not recovered', sub: 'within 24 h', censored: true }
  }
  if (key === 'passenger_delay_avg_min' && m.cancelled_flights > 0) {
    return { text: fmtMetric(key, v, info), sub: `${m.cancelled_flights} cancelled`, censored: false }
  }
  if (key === 'medical_response_avg_min' && m.medical_count === 0) return { text: 'no medevac', censored: false }
  if (key === 'cargo_delay_avg_min' && m.cargo_count === 0) return { text: 'no cargo', censored: false }
  return { text: fmtMetric(key, v, info), censored: false }
}

export function pValue(p: number | null): string {
  if (p === null || p === undefined) return '—'
  if (p < 0.001) return 'p < 0.001'
  return `p = ${p.toFixed(3)}`
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`
}

export const MISSION_LABEL: Record<string, string> = { medical: 'Medevac', cargo: 'Cargo', passenger: 'Passenger' }
export const ROLE_LABEL: Record<string, string> = { medevac: 'Medevac', passenger: 'Passenger', combi: 'Combi', utility: 'Utility' }
export const DISRUPTION_LABEL: Record<string, string> = {
  airport_closure: 'Airport closure', wildfire: 'Wildfire', severe_weather: 'Severe weather',
  aircraft_failure: 'Aircraft failure', medical_emergency: 'Medical emergency', essential_cargo_request: 'Essential cargo',
}
export const REASON_TEXT: Record<string, string> = {
  AIRCRAFT_FAILED: 'aircraft unserviceable',
  AIRCRAFT_STRANDED: 'aircraft on the ground at a closed airport',
  CAPACITY_PEOPLE: 'not enough seats',
  CAPACITY_KG: 'not enough cargo capacity',
  RUNWAY_ORIGIN: 'cannot use the origin runway',
  RUNWAY_DEST: 'cannot use the destination runway',
  NO_PATH_MISSION: 'no open route within range between origin and destination',
  NO_PATH_TO_ORIGIN: 'no open route within range to reach the origin',
  ORIGIN_CLOSED: 'origin airport closed',
  DEST_CLOSED: 'destination airport closed',
  DEFERRED_BY_OPTIMIZER: 'every option cost more than the unserved penalty',
  NO_USABLE_AIRCRAFT: 'no usable aircraft',
  NO_FREE_COMPATIBLE_AIRCRAFT: 'no free compatible aircraft',
  NO_RESPONSE_POLICY: 'no response (schedule only)',
}
export function reasonText(code: string | null | undefined): string {
  if (!code) return ''
  return REASON_TEXT[code] ?? code.toLowerCase().replaceAll('_', ' ')
}
