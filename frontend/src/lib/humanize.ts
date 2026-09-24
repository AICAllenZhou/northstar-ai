// Human sentences derived from the live state: disruptions, missions, metrics,
// decisions. Every fact comes from the API (network, scenario, runs, compare);
// nothing here invents a number or a place name.
import type {
  Airport, CompareResponse, DecisionReason, DecisionRecord, Disruption, DisruptionEffect, ExperimentSummary, Metrics, Mission,
  NetworkResponse, Preset, ScenarioState,
} from '../api/types'
import { haversineKm } from '../map/geo'
import { fmtNumber, metricCell } from './format'
import { clock, duration } from './time'

// ---- presets ---------------------------------------------------------------

export const PRESET_TITLE: Record<string, string> = {
  kivalliq_wildfire: 'Wildfire crisis',
  baffin_blizzard: 'Arctic weather',
  kitikmeot_medevac_failure: 'Medical emergency + aircraft failure',
  cargo_shortage: 'Cargo shortage',
  cascading_failure: 'Cascading disruption',
}
export const presetTitle = (p: Preset | { id: string; name: string }): string => PRESET_TITLE[p.id] ?? p.name

export function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/)
  return (m ? m[0] : s).trim()
}

export type Complexity = 'Low' | 'Medium' | 'High'
export const complexity = (n: number): Complexity => (n <= 3 ? 'Low' : n <= 5 ? 'Medium' : 'High')

// ---- generated experiment scenarios ----------------------------------------

const COUNT_WORDS: Record<string, [string, string]> = {
  'closure(s)': ['closure', 'closures'],
  'weather event(s)': ['weather event', 'weather events'],
  'aircraft failure(s)': ['aircraft failure', 'aircraft failures'],
  'medevac(s)': ['medevac', 'medevacs'],
  'cargo request(s)': ['cargo request', 'cargo requests'],
}

/** The generator's count list, "3 closure(s), 0 weather event(s), 1 medevac(s)" → "3 closures · 1 medevac" (zero counts dropped). */
export function compactDescription(desc: string): string {
  const parts = desc.split(', ').map((part) => {
    const m = part.match(/^(\d+) (.+)$/)
    if (!m) return part
    const n = Number(m[1]), w = COUNT_WORDS[m[2]]
    if (!w) return part
    return n === 0 ? '' : `${n} ${n === 1 ? w[0] : w[1]}`
  }).filter(Boolean)
  return parts.length ? parts.join(' · ') : desc
}

/** One line for a scenario card: the generator's count list is compacted, any other description keeps its first sentence. */
export function scenarioBlurb(description: string): string {
  return /\(s\)/.test(description) ? compactDescription(description) : firstSentence(description)
}

const GEN_ID = /^gen-(\d+)-(\d+)$/
/** "gen-42-017" → { seed: 42, index: 17 } (the number the backend also puts in "Generated scenario 17"); null for presets and hand-built scenarios. */
export function generatedScenario(id: string | null | undefined): { seed: number; index: number } | null {
  const m = id?.match(GEN_ID)
  return m ? { seed: Number(m[1]), index: Number(m[2]) } : null
}

/** "Scenario 17 of the 100-scenario experiment (seed 42); the run buttons solve it live." Null unless the id is a
 *  row of the loaded experiment summary (so n, N and the seed all come from the same committed run). */
export function experimentSentence(id: string | null | undefined, exp: ExperimentSummary | null): string | null {
  const g = generatedScenario(id)
  if (!g || !exp) return null
  const rows = exp.per_scenario[exp.primary_policy] ?? []
  if (!rows.some((r) => r.scenario_id === id)) return null
  return `Scenario ${g.index} of the ${fmtNumber(exp.n_scenarios)}-scenario experiment (seed ${exp.seed}); the run buttons solve it live.`
}

// ---- small formatting ------------------------------------------------------

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const numberWord = (n: number): string => WORDS[n] ?? String(n)
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
export const fmtPop = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : fmtNumber(n))

export function listWords(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ---- network lookups -------------------------------------------------------

export const airportOf = (n: NetworkResponse | null, id: string | null | undefined): Airport | undefined => n?.airports.find((a) => a.id === id)
export const airportName = (n: NetworkResponse | null, id: string | null | undefined): string => airportOf(n, id)?.community_name ?? id ?? '—'
export function communityOf(n: NetworkResponse | null, id: string | null | undefined) {
  return n?.communities.find((c) => c.id === id || c.airport_id === id)
}
export const communityName = (n: NetworkResponse | null, id: string | null | undefined): string => communityOf(n, id)?.name ?? airportName(n, id)

export const isNorthHub = (a: Airport): boolean => (a.is_medical_hub || a.is_cargo_hub || a.is_passenger_hub) && a.region !== 'South gateway'

/** "Rankin Inlet (the Kivalliq hub)" for hubs, plain community name otherwise. */
export function nameWithHub(n: NetworkResponse | null, id: string): string {
  const a = airportOf(n, id)
  if (!a) return id
  return isNorthHub(a) ? `${a.community_name} (the ${a.region} hub)` : a.community_name
}

/** Short aircraft type: "ATR 42-500 combi" -> "ATR 42". */
export function shortType(type: string): string {
  const m = type.match(/^([A-Za-z]+(?:-?\d+)?(?: \d+)?)/)
  return m ? m[1].replace(/-$/, '') : type
}

/** Nearest northern medical hub (great circle) to a community's airport. */
export function nearestMedicalHub(n: NetworkResponse | null, airportId: string): Airport | null {
  const from = airportOf(n, airportId)
  if (!n || !from) return null
  let best: Airport | null = null, bestKm = Infinity
  for (const id of n.hubs.medical) {
    const a = airportOf(n, id)
    if (!a || a.region === 'South gateway' || a.id === from.id) continue
    const km = haversineKm(from.lat, from.lon, a.lat, a.lon)
    if (km < bestKm) { bestKm = km; best = a }
  }
  return best
}

// ---- disruptions -----------------------------------------------------------

export interface HumanEvent {
  /** What happens, no time in it. */
  text: string
  /** "07:00–17:00" */
  when: string
  start: number
  end: number
}

/** Types that create a mission; they are described as missions, not as disruptions. */
export const MISSION_TYPES = new Set(['medical_emergency', 'essential_cargo_request'])

export function describeDisruption(d: Disruption, e: DisruptionEffect | undefined, n: NetworkResponse | null, opts: { hubNote?: boolean } = {}): HumanEvent {
  const start = d.start_min
  const end = e?.end_min ?? d.start_min + d.duration_min
  const when = `${clock(start)}–${clock(end, true)}`
  const nm = (id: string) => (opts.hubNote ? nameWithHub(n, id) : airportName(n, id))
  const affected = (e?.affected_airports?.length ? e.affected_airports : d.target_ids).map(nm)
  let text: string
  switch (d.type) {
    case 'wildfire':
      text = e?.closes_airports && affected.length ? `Wildfire smoke closes ${listWords(affected)}`
        : affected.length ? `Wildfire smoke near ${listWords(affected)} raises route risk` : 'Wildfire smoke'
      break
    case 'severe_weather':
      text = e?.closes_airports && affected.length ? `Severe weather closes ${listWords(affected)}`
        : affected.length ? `Severe weather over ${listWords(affected)} degrades routes` : 'Severe weather'
      break
    case 'airport_closure':
      text = `${listWords(affected)} closed`
      break
    case 'aircraft_failure': {
      const parts = d.target_ids.map((id) => {
        const ac = n?.aircraft.find((a) => a.id === id)
        if (!ac) return `${id} grounded`
        return `${airportName(n, ac.home_airport_id)}'s ${ac.type} is grounded`
      })
      text = listWords(parts)
      break
    }
    case 'medical_emergency': {
      const p = Number(d.params.priority ?? 1)
      text = `Priority-${p} medical evacuation from ${communityName(n, d.target_ids[0])}`
      break
    }
    case 'essential_cargo_request': {
      const kg = Number(d.params.payload_kg ?? 0)
      const what = String(d.params.cargo ?? 'essential supplies')
      // params.deadline_min counts from the request, so the absolute deadline is start + deadline.
      const dl = d.params.deadline_min !== undefined ? ` by ${clock(d.start_min + Number(d.params.deadline_min))}` : ''
      text = `${fmtNumber(kg)} kg of ${what} for ${communityName(n, d.target_ids[0])}${dl}`
      break
    }
    default:
      text = d.label || d.type
  }
  return { text, when, start, end }
}

// ---- missions --------------------------------------------------------------

export interface HumanMission {
  title: string
  meta: string
  /** "medical supplies" etc. for cargo, from the requesting disruption. */
  kind: string | null
}

export function describeMission(m: Mission, scenario: ScenarioState | null, n: NetworkResponse | null): HumanMission {
  const com = communityOf(n, m.community_id) ?? communityOf(n, m.type === 'medical' ? m.origin : m.dest)
  const cname = com?.name ?? communityName(n, m.community_id)
  if (m.type === 'medical') {
    return {
      title: m.priority === 1 ? 'Urgent medical evacuation' : `Medical evacuation (priority ${m.priority})`,
      meta: [cname, com?.population_2021 ? `population ${fmtPop(com.population_2021)}` : null, `called ${clock(m.release_min)}`].filter(Boolean).join(' · '),
      kind: null,
    }
  }
  if (m.type === 'cargo') {
    const req = scenario?.scenario.disruptions.find((d) => d.type === 'essential_cargo_request' && (d.target_ids.includes(m.community_id ?? '') || d.target_ids.includes(m.dest)))
    const kind = String(req?.params.cargo ?? 'essential supplies')
    return {
      title: 'Essential cargo',
      meta: [cname, `${fmtNumber(m.payload_kg)} kg ${kind}`, m.deadline_min !== null ? `by ${clock(m.deadline_min)}` : null].filter(Boolean).join(' · '),
      kind,
    }
  }
  return {
    title: `${airportName(n, m.origin)} → ${airportName(n, m.dest)}`,
    meta: `${m.payload_people} passengers · ${clock(m.release_min)}`,
    kind: null,
  }
}

/** "the Chesterfield Inlet medevac" / "the Coral Harbour cargo" / "flight SCH-02". */
export function missionShort(d: DecisionRecord, n: NetworkResponse | null): string {
  const c = communityName(n, d.community_id)
  if (d.mission_type === 'medical') return `the ${c} medevac`
  if (d.mission_type === 'cargo') return `the ${c} cargo`
  return `flight ${d.mission_id}`
}

// ---- metrics: result rows and trade-offs -----------------------------------

export const RESULT_LABEL: Record<string, string> = {
  disconnected_communities_end: 'Communities still cut off at end of day',
  disconnected_community_hours: 'Disconnected-community hours',
  cancelled_flights: 'Cancelled flights',
  cargo_delay_avg_min: 'Essential cargo delay past deadline',
  medical_response_avg_min: 'Mean medical response',
  passenger_delay_avg_min: 'Mean passenger delay',
  recovery_time_min: 'Network recovery time',
}

/** Up to four rows for the result card, in the brief's priority, only where data exists. */
export function resultRows(c: CompareResponse | null): string[] {
  if (!c?.baseline || !c.northstar) return []
  const b = c.baseline, ns = c.northstar
  const rows = ['disconnected_communities_end', 'disconnected_community_hours', 'cancelled_flights']
  const medicalExists = b.medical_count > 0 || ns.medical_count > 0
  const cargoExists = b.cargo_count > 0 || ns.cargo_count > 0
  const medicalDiffers = medicalExists && (b.medical_unserved !== ns.medical_unserved || (b.medical_response_avg_min ?? 0) !== (ns.medical_response_avg_min ?? 0))
  if (medicalDiffers) rows.push('medical_response_avg_min')
  else if (cargoExists) rows.push('cargo_delay_avg_min')
  else if (medicalExists) rows.push('medical_response_avg_min')
  return rows.slice(0, 4)
}

export interface BigValue { text: string; unit: string; sub?: string; censored: boolean }

/** Big numeral + small unit for a result cell (censoring kept). */
export function bigValue(key: string, m: Metrics | undefined, c: CompareResponse | null): BigValue {
  const info = c?.metric_info[key]
  const cell = metricCell(key, m, info)
  if (cell.censored || !m) return { text: cell.text, unit: '', sub: cell.sub, censored: cell.censored }
  const raw = (m as unknown as Record<string, number | null>)[key]
  if (typeof raw !== 'number') return { text: cell.text, unit: '', censored: false }
  switch (info?.unit) {
    case 'h': return { text: fmtNumber(raw, 1), unit: 'h', censored: false }
    case 'min': return { text: duration(raw), unit: '', sub: cell.sub, censored: false }
    case 'communities': return { text: fmtNumber(raw), unit: '', censored: false }
    case 'flights': return { text: fmtNumber(raw), unit: '', censored: false }
    default: return { text: cell.text, unit: '', sub: cell.sub, censored: false }
  }
}

export type Verdict = 'better' | 'worse' | 'same' | ''
export function verdict(c: CompareResponse | null, key: string): Verdict {
  const d = c?.deltas[key]
  if (!d || !c?.baseline || !c.northstar) return ''
  if (d.delta === 0 || d.better === null) return 'same'
  return d.better ? 'better' : 'worse'
}

const TRADE_ORDER = ['cargo_delay_avg_min', 'medical_response_avg_min', 'passenger_delay_avg_min', 'disconnected_community_hours', 'cancelled_flights',
  'disconnected_communities_end', 'recovery_time_min', 'reroutes', 'distance_flown_km', 'operating_cost_index']

function tradePhrase(key: string, delta: number): string {
  const d = Math.abs(delta)
  switch (key) {
    case 'cargo_delay_avg_min': return `essential cargo arrives ${duration(d)} later than under the baseline`
    case 'medical_response_avg_min': return `medical response is ${duration(d)} slower than under the baseline`
    case 'passenger_delay_avg_min': return `passenger flights run ${duration(d)} later on average`
    case 'disconnected_community_hours': return `${fmtNumber(d, 1)} more disconnected-community hours`
    case 'cancelled_flights': return `${plural(d, 'more cancelled flight')}`
    case 'disconnected_communities_end': return `${plural(d, 'more community', 'more communities')} still cut off at end of day`
    case 'recovery_time_min': return `the network recovers ${duration(d)} later`
    case 'reroutes': return `${plural(d, 'more reassignment')} than the baseline`
    case 'distance_flown_km': return `${fmtNumber(d)} km more flown`
    case 'operating_cost_index': return `operating cost index ${fmtNumber(d)} higher`
    default: return `${key.replaceAll('_', ' ')} worse by ${fmtNumber(d, 1)}`
  }
}

/** The first metric that got worse, in a fixed priority order, or null. */
export function tradeoffSentence(c: CompareResponse | null): string | null {
  if (!c?.baseline || !c.northstar) return null
  for (const k of TRADE_ORDER) {
    const d = c.deltas[k]
    if (d && d.better === false && d.delta !== 0) return `Trade-off: ${tradePhrase(k, d.delta)}.`
  }
  return null
}

function gainPhrase(key: string, b: Metrics, n: Metrics, c: CompareResponse): string {
  const info = c.metric_info[key]
  const bv = metricCell(key, b, info).text, nv = metricCell(key, n, info).text
  const label = (RESULT_LABEL[key] ?? info?.label ?? key)
  return `${label}: ${bv} → ${nv}`
}

/** Biggest relative gain among the headline metrics, as "Label: before → after". */
export function biggestGainSentence(c: CompareResponse | null): string | null {
  if (!c?.baseline || !c.northstar) return null
  const b = c.baseline, n = c.northstar
  const keys = ['disconnected_communities_end', 'cancelled_flights', 'disconnected_community_hours', 'medical_response_avg_min', 'cargo_delay_avg_min', 'passenger_delay_avg_min', 'recovery_time_min']
  let best: string | null = null, bestScore = 0
  for (const k of keys) {
    const d = c.deltas[k]
    if (!d || d.better !== true) continue
    const base = (b as unknown as Record<string, number | null>)[k]
    const score = typeof base === 'number' && base !== 0 ? Math.abs(d.delta) / Math.abs(base) : Math.abs(d.delta) > 0 ? 1 : 0
    if (score > bestScore) { bestScore = score; best = k }
  }
  return best ? `Biggest gain — ${gainPhrase(best, b, n, c)}.` : 'No metric improved against the baseline in this scenario.'
}

// ---- decisions: checklist from reason codes --------------------------------

export interface CheckItem { ok: boolean; text: string; note?: string }

function runwayFromText(text: string): string | null {
  const m = text.match(/(\d[\d,]*)\s*m\s+(\w+)\s+runway/i)
  return m ? `${m[1]} m ${m[2]}` : null
}

export function reasonChecklist(d: DecisionRecord, n: NetworkResponse | null): CheckItem[] {
  const out: CheckItem[] = []
  for (const r of d.reasons as DecisionReason[]) {
    const data = r.data ?? {}
    switch (r.code) {
      case 'PRIORITY':
        if (data.priority !== undefined) out.push({ ok: true, text: `medical priority ${data.priority}` })
        else if (data.deadline_min !== undefined) out.push({ ok: true, text: `essential cargo, deadline ${clock(Number(data.deadline_min))}` })
        else out.push({ ok: true, text: r.text.toLowerCase() })
        break
      case 'NEAREST_RANK': {
        const rank = Number(data.rank ?? 1)
        const what = String(data.what ?? 'response')
        if (rank <= 1) out.push({ ok: true, text: `earliest-${what} compatible aircraft` })
        else {
          const nearest = (data.nearest ?? data.nearest_aircraft ?? data.best) as string | undefined
          out.push({ ok: true, text: `instead of ${nearest ?? 'the nearest aircraft'}`, note: `ranked ${rank} by ${what} — ${r.text}` })
        }
        break
      }
      case 'RUNWAY_OK': {
        const rw = runwayFromText(r.text)
        out.push({ ok: true, text: rw ? `runway compatible (${rw})` : 'runway compatible' })
        break
      }
      case 'RANGE_OK': {
        const km = typeof data.mission_km === 'number' ? data.mission_km : null
        const range = typeof data.range_km === 'number' ? data.range_km : null
        out.push({ ok: true, text: km !== null && range !== null ? `within range (${fmtNumber(km)} of ${fmtNumber(range)} km)` : 'within range' })
        break
      }
      case 'CAPACITY': case 'CAPACITY_OK':
        out.push({ ok: true, text: 'capacity sufficient' })
        break
      case 'MULTI_HOP': {
        const path = Array.isArray(data.path) ? (data.path as string[]) : d.path ?? []
        const via = path.slice(1, -1).map((p) => airportName(n, p))
        out.push({ ok: true, text: via.length ? `routed via ${via.join(', ')}` : 'multi-hop routing' })
        break
      }
      case 'ALTERNATE_HUB': {
        const o = data.origin ? airportName(n, String(data.origin)) : null
        out.push({ ok: true, text: o ? `alternate hub used (${o})` : 'alternate hub used' })
        break
      }
      case 'UNSERVED_BECAUSE':
        out.push({ ok: false, text: `not served: ${r.text}` })
        break
      default:
        out.push({ ok: true, text: r.text })
    }
  }
  return out
}

export function altCounts(d: DecisionRecord) {
  const rejected = d.alternatives.filter((a) => a.verdict === 'rejected').length
  const busy = d.alternatives.filter((a) => a.verdict === 'busy').length
  const worse = d.alternatives.filter((a) => a.verdict === 'worse').length
  return { n: d.alternatives.length, rejected, busy, worse }
}

/** "Response 4h → 4h, same as baseline" / "Completion 12h30 → 16h, 3h30 later than baseline (AC-01)". */
export function vsBaselineText(d: DecisionRecord): string | null {
  const v = d.vs_baseline
  if (!v) return null
  const what = v.metric === 'response_min' ? 'Response' : 'Completion'
  if (v.baseline_status && v.baseline_status !== 'completed') return `${what} ${duration(v.northstar_value)} — the baseline did not serve this mission (${v.baseline_status}).`
  const bv = duration(v.baseline_value), nv = duration(v.northstar_value)
  const who = v.baseline_aircraft_id && v.baseline_aircraft_id !== d.aircraft_id ? ` (baseline used ${v.baseline_aircraft_id})` : ''
  if (v.delta_min === null || v.delta_min === 0) return `${what} ${bv} → ${nv}, same as baseline${who}.`
  return `${what} ${bv} → ${nv}, ${duration(Math.abs(v.delta_min))} ${v.delta_min < 0 ? 'faster' : 'later'} than baseline${who}.`
}

/** The medevac decision if there is one, else the first decision. */
export function pickDecision(decisions: DecisionRecord[]): DecisionRecord | null {
  return decisions.find((x) => x.mission_type === 'medical' && x.status !== 'unserved') ?? decisions.find((x) => x.mission_type === 'medical') ?? decisions[0] ?? null
}
