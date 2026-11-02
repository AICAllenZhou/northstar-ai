// Pure helpers that derive what the UI shows at a given simulation time from
// the scenario definition and (optionally) a run trace. No API calls here.
import type {
  Aircraft, DisruptionEffect, NetworkResponse, RunResult, ScenarioState, Snapshot, StrategyName,
} from '../api/types'
import { bearing, interpolateGC, type LngLat } from '../map/geo'
import { snapshotIndex } from './time'

export type NetworkState = 'NORMAL' | 'WARNING' | 'DISRUPTED' | 'OPTIMIZED'

export function networkState(scenario: ScenarioState | null, displayedRun: StrategyName | null): NetworkState {
  if (!scenario || scenario.scenario.disruptions.length === 0) return displayedRun === 'northstar' ? 'OPTIMIZED' : 'NORMAL'
  if (displayedRun === 'northstar') return 'OPTIMIZED'
  if (displayedRun === 'baseline' || displayedRun === 'do_nothing') return 'DISRUPTED'
  return 'WARNING'
}

export interface StatusAt {
  closedAirports: Set<string>
  closedRoutes: Set<string>
  failedAircraft: Set<string>
  disconnected: Set<string>      // service + structural (community ids)
  structural: Set<string>        // structurally isolated (community ids)
  activeDisruptions: DisruptionEffect[]
  routeRisk: Record<string, number>
  snapshot: Snapshot | null
}

export function snapshotAt(run: RunResult | null | undefined, t: number): Snapshot | null {
  if (!run) return null
  const snaps = run.trace.snapshots
  if (snaps.length === 0) return null
  const i = Math.min(snaps.length - 1, snapshotIndex(t, run.trace.step_min))
  return snaps[i]
}

/** What is closed / failed / disconnected at time t. With a run, the trace is
 *  authoritative; without one, the scenario's declared effects are used. */
export function statusAt(scenario: ScenarioState | null, run: RunResult | null | undefined, t: number, network: NetworkResponse | null): StatusAt {
  const effects = scenario?.disruption_effects ?? []
  const active = effects.filter((e) => e.start_min <= t && t < e.end_min)
  const snap = snapshotAt(run, t)
  if (snap) {
    return {
      closedAirports: new Set(snap.closed_airports),
      closedRoutes: new Set(snap.closed_routes),
      failedAircraft: new Set(snap.failed_aircraft),
      disconnected: new Set(snap.disconnected),
      structural: new Set(snap.structural_disconnected),
      activeDisruptions: active,
      routeRisk: snap.route_risk ?? {},
      snapshot: snap,
    }
  }
  const closedAirports = new Set<string>()
  const failedAircraft = new Set<string>()
  for (const e of active) {
    if (e.closes_airports && e.affected_airports) e.affected_airports.forEach((a) => closedAirports.add(a))
    if (e.type === 'aircraft_failure') e.target_ids.forEach((a) => failedAircraft.add(a))
  }
  // Without a trace the only disconnection we can state is the structural one
  // implied by a closed airport (the community's only airport).
  const structural = new Set<string>()
  if (network) {
    for (const c of network.communities) if (closedAirports.has(c.airport_id)) structural.add(c.id)
  }
  if (t === 0 && scenario) scenario.structurally_disconnected_t0.forEach((c) => structural.add(c))
  return {
    closedAirports, closedRoutes: new Set(), failedAircraft, disconnected: new Set(structural), structural,
    activeDisruptions: active, routeRisk: {}, snapshot: null,
  }
}

export interface AircraftPosition {
  id: string
  lngLat: LngLat
  bearing: number | null
  status: 'ground' | 'flying' | 'failed' | 'stranded'
  airportId: string | null
  /** Origin of the leg in flight (null on the ground). */
  legFrom: string | null
  legTo: string | null
  missionId: string | null
}

const airportIndex = (network: NetworkResponse) => new Map(network.airports.map((a) => [a.id, [a.lon, a.lat] as LngLat]))

/** Aircraft positions at (fractional) time t, interpolated along the great
 *  circle of the leg in flight. Falls back to the snapshot ground position,
 *  and to home airports when no run is displayed. */
export function aircraftPositionsAt(network: NetworkResponse, run: RunResult | null | undefined, t: number, failedNoRun: Set<string>): AircraftPosition[] {
  const apt = airportIndex(network)
  const out: AircraftPosition[] = []
  const snap = snapshotAt(run, t)
  for (const ac of network.aircraft) {
    if (!run || !snap) {
      const p = apt.get(ac.home_airport_id) ?? [0, 0]
      out.push({ id: ac.id, lngLat: p, bearing: null, status: failedNoRun.has(ac.id) ? 'failed' : 'ground', airportId: ac.home_airport_id, legFrom: null, legTo: null, missionId: null })
      continue
    }
    const leg = run.trace.legs.find((l) => l.aircraft_id === ac.id && l.depart_min <= t && t < l.arrive_min)
    const s = snap.aircraft.find((a) => a.id === ac.id)
    if (leg) {
      const a = apt.get(leg.from_airport), b = apt.get(leg.to_airport)
      if (a && b) {
        const f = (t - leg.depart_min) / Math.max(1, leg.arrive_min - leg.depart_min)
        out.push({ id: ac.id, lngLat: interpolateGC(a, b, f), bearing: bearing(interpolateGC(a, b, Math.max(0, f - 0.01)), b), status: 'flying', airportId: null, legFrom: leg.from_airport, legTo: leg.to_airport, missionId: leg.mission_id })
        continue
      }
    }
    if (s) {
      out.push({ id: ac.id, lngLat: [s.lon, s.lat], bearing: null, status: s.status === 'flying' ? 'ground' : s.status, airportId: s.airport_id, legFrom: null, legTo: null, missionId: s.mission_id })
    } else {
      const p = apt.get(ac.home_airport_id) ?? [0, 0]
      out.push({ id: ac.id, lngLat: p, bearing: null, status: 'ground', airportId: ac.home_airport_id, legFrom: null, legTo: null, missionId: null })
    }
  }
  return out
}

export function routeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Route ids flown by the displayed run (any leg). */
export function usedRouteIds(network: NetworkResponse, run: RunResult | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!run) return out
  const byKey = new Map(network.routes.map((r) => [routeKey(r.origin_airport_id, r.destination_airport_id), r.id]))
  for (const l of run.trace.legs) {
    const id = byKey.get(routeKey(l.from_airport, l.to_airport))
    if (id) out.add(id)
  }
  return out
}

/** Direction in which the displayed run flies each used route: +1 = as stored
 *  (origin → destination), −1 = reversed; a route flown both ways takes the
 *  majority direction (ties → +1). Drives the map's directional flow. */
export function usedRouteDirections(network: NetworkResponse, run: RunResult | null | undefined): Map<string, 1 | -1> {
  const out = new Map<string, 1 | -1>()
  if (!run) return out
  const byKey = new Map(network.routes.map((r) => [routeKey(r.origin_airport_id, r.destination_airport_id), r]))
  const tally = new Map<string, number>()
  for (const l of run.trace.legs) {
    const r = byKey.get(routeKey(l.from_airport, l.to_airport))
    if (!r) continue
    tally.set(r.id, (tally.get(r.id) ?? 0) + (l.from_airport === r.origin_airport_id ? 1 : -1))
  }
  for (const [id, n] of tally) out.set(id, n < 0 ? -1 : 1)
  return out
}

/** Aircraft whose work differs between baseline and NORTHSTAR (reassignments). */
export function changedAircraft(baseline: RunResult | undefined, northstar: RunResult | undefined): string[] {
  if (!baseline || !northstar) return []
  const b = new Map(baseline.assignments.map((a) => [a.mission_id, a]))
  const changed = new Set<string>()
  for (const a of northstar.assignments) {
    if (a.status !== 'completed' || !a.aircraft_id) continue
    const prev = b.get(a.mission_id)
    if (prev?.aircraft_id !== a.aircraft_id || prev.status !== 'completed') {
      changed.add(a.aircraft_id)
      if (prev?.status === 'completed' && prev.aircraft_id) changed.add(prev.aircraft_id)
    }
  }
  return [...changed].sort()
}

export function aircraftById(network: NetworkResponse | null, id: string | null | undefined): Aircraft | undefined {
  return network?.aircraft.find((a) => a.id === id)
}
export function airportName(network: NetworkResponse | null, id: string | null | undefined): string {
  return network?.airports.find((a) => a.id === id)?.community_name ?? id ?? '—'
}
export function communityName(network: NetworkResponse | null, id: string | null | undefined): string {
  return network?.communities.find((c) => c.id === id)?.name ?? id ?? '—'
}
