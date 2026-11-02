import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Airport, DisruptionEffect, Mission, NetworkResponse, RunResult, StrategyName } from '../api/types'
import { usedRouteDirections, type StatusAt } from '../lib/derive'
import { flowLayerId, STRATEGIES } from './flow'
import { circlePolygon, greatCirclePoints, type LngLat } from './geo'
import { MAP_COLORS } from './style'

import type { Feature, FeatureCollection } from 'geojson'
type FC = FeatureCollection
const EMPTY: FC = { type: 'FeatureCollection', features: [] }

export const SOURCES = ['disruptions', 'routes', 'used', 'trails', 'mission-arrows', 'highlight-path', 'community-rings', 'airports'] as const

export const USED_COLOR: Record<StrategyName, string> = {
  do_nothing: MAP_COLORS.routeUsedDoNothing,
  baseline: MAP_COLORS.routeUsedBaseline,
  northstar: MAP_COLORS.routeUsedNorthstar,
}
const usedLayerId = (s: StrategyName) => `used-${s}`
const HIGHLIGHT_GLOW_OPACITY = 0.28

/** Adds the empty overlay sources and their layers once the style has loaded.
 *  `transitionMs` is 0 under reduced motion, otherwise ~500 ms so switching the
 *  displayed run cross-fades instead of cutting. */
export function addOverlayLayers(map: MlMap, transitionMs: number): void {
  for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: EMPTY })
  const T = { duration: transitionMs }

  map.addLayer({
    id: 'disruptions-fill', type: 'fill', source: 'disruptions',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
  })
  map.addLayer({
    id: 'disruptions-line', type: 'line', source: 'disruptions', filter: ['==', ['get', 'ring'], 'inner'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.2, 'line-opacity': ['get', 'lineOpacity'], 'line-dasharray': [3, 2] },
  })
  // Soft presence under hubs; danger-tinted when the hub is closed, teal for the selected airport.
  map.addLayer({
    id: 'airport-halos', type: 'circle', source: 'airports', filter: ['!=', ['get', 'halo'], 'none'],
    paint: {
      'circle-radius': 16, 'circle-blur': 1,
      'circle-color': ['match', ['get', 'halo'], 'closed', 'rgba(255,71,71,0.16)', 'selected', 'rgba(46,230,214,0.18)', 'rgba(233,241,248,0.10)'],
    },
  })
  map.addLayer({
    id: 'routes-open', type: 'line', source: 'routes', filter: ['!=', ['get', 'state'], 'closed'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['match', ['get', 'state'], 'risk', 1.6, 1.1],
      'line-opacity': ['match', ['get', 'state'], 'risk', 0.9, 0.8],
      'line-opacity-transition': T, 'line-color-transition': T,
    },
  })
  map.addLayer({
    id: 'routes-closed', type: 'line', source: 'routes', filter: ['==', ['get', 'state'], 'closed'],
    paint: { 'line-color': MAP_COLORS.routeClosed, 'line-width': 1.6, 'line-dasharray': [2, 2] },
  })
  // One solid "used" layer and one flow layer per strategy: only their opacity
  // changes when the displayed run changes, which MapLibre can transition
  // (data-driven colours cannot), so Baseline ↔ NORTHSTAR reads as a cross-fade.
  for (const s of STRATEGIES) {
    map.addLayer({
      id: usedLayerId(s), type: 'line', source: 'used',
      filter: ['all', ['==', ['get', 'strategy'], s], ['!', ['get', 'closed']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': USED_COLOR[s], 'line-width': 2.6, 'line-opacity': 0, 'line-opacity-transition': T },
    })
  }
  for (const s of STRATEGIES) {
    map.addLayer({
      id: flowLayerId(s), type: 'line', source: 'used',
      filter: ['all', ['==', ['get', 'strategy'], s], ['!', ['get', 'closed']]],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': USED_COLOR[s], 'line-width': 2.6, 'line-opacity': 0, 'line-dasharray': [0, 4, 3], 'line-opacity-transition': T },
    })
  }
  map.addLayer({
    id: 'routes-hit', type: 'line', source: 'routes',
    paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 },
  })
  map.addLayer({
    id: 'highlight-glow', type: 'line', source: 'highlight-path',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_COLORS.ns, 'line-width': 9, 'line-opacity': 0, 'line-blur': 2, 'line-opacity-transition': T, 'line-color-transition': T },
  })
  map.addLayer({
    id: 'highlight-core', type: 'line', source: 'highlight-path',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_COLORS.ns, 'line-width': 2.5, 'line-opacity': 0, 'line-opacity-transition': T, 'line-color-transition': T },
  })
  map.addLayer({
    id: 'mission-arrows', type: 'line', source: 'mission-arrows',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1.2, 1.6] },
  })
  // The part of the current leg already flown, in the aircraft's colour (rebuilt every time tick).
  map.addLayer({
    id: 'trails', type: 'line', source: 'trails',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.35 },
  })
  map.addLayer({
    id: 'community-rings', type: 'circle', source: 'community-rings',
    paint: {
      'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2.2, 'circle-stroke-opacity': 0.95,
      'circle-stroke-opacity-transition': T, 'circle-stroke-color-transition': T,
    },
  })
  map.addLayer({
    id: 'airports', type: 'circle', source: 'airports',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], ['+', ['get', 'r'], 2], ['get', 'r']],
      'circle-color': ['case', ['get', 'closed'], '#2a1214', ['get', 'hub'], '#eef3f8', '#9fb0c2'],
      'circle-stroke-color': ['case', ['get', 'closed'], MAP_COLORS.danger, ['get', 'selected'], MAP_COLORS.ns, ['get', 'hub'], '#ffffff', '#0a0f15'],
      'circle-stroke-width': ['case', ['get', 'closed'], 2.5, ['get', 'selected'], 2.5, ['get', 'hub'], 1.5, 1.2],
    },
  })
}

function setData(map: MlMap, id: string, fc: FC) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (src) src.setData(fc)
}

/** Fades the solid + flow layers of the displayed strategy in and the others out. */
export function setDisplayedStrategy(map: MlMap, displayed: StrategyName | null): void {
  for (const s of STRATEGIES) {
    const on = s === displayed
    if (map.getLayer(usedLayerId(s))) map.setPaintProperty(usedLayerId(s), 'line-opacity', on ? 0.95 : 0)
    if (map.getLayer(flowLayerId(s))) map.setPaintProperty(flowLayerId(s), 'line-opacity', on ? 0.55 : 0)
  }
}

export interface OverlayInput {
  network: NetworkResponse
  status: StatusAt
  run: RunResult | null
  runs: Partial<Record<StrategyName, RunResult>>
  displayedRun: StrategyName | null
  missions: Mission[]
  effects: DisruptionEffect[]
  t: number
  highlightPath: string[] | null
  selectedAirport: string | null
}

export function updateOverlays(map: MlMap, inp: OverlayInput): void {
  const apt = new Map(inp.network.airports.map((a) => [a.id, a]))
  const ll = (id: string): LngLat | null => { const a = apt.get(id); return a ? [a.lon, a.lat] : null }
  const routeClosed = (r: { id: string; origin_airport_id: string; destination_airport_id: string }) =>
    inp.status.closedRoutes.has(r.id) || inp.status.closedAirports.has(r.origin_airport_id) || inp.status.closedAirports.has(r.destination_airport_id)

  // routes (normal / elevated risk / closed); the flown ones are drawn by the per-strategy layers below
  const routes: Feature[] = []
  for (const r of inp.network.routes) {
    const a = ll(r.origin_airport_id), b = ll(r.destination_airport_id)
    if (!a || !b) continue
    const closed = routeClosed(r)
    const risk = inp.status.routeRisk[r.id] ?? r.base_risk
    const state = closed ? 'closed' : risk > 0.3 ? 'risk' : 'normal'
    const color = state === 'risk' ? MAP_COLORS.routeRisk : MAP_COLORS.routeNormal
    routes.push({ type: 'Feature', properties: { id: r.id, state, color, risk }, geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, 16) } })
  }
  setData(map, 'routes', { type: 'FeatureCollection', features: routes })

  // used routes of every computed run, oriented in the direction actually flown
  const used: Feature[] = []
  for (const s of STRATEGIES) {
    const run = inp.runs[s]
    if (!run) continue
    const dirs = usedRouteDirections(inp.network, run)
    for (const r of inp.network.routes) {
      const dir = dirs.get(r.id)
      if (!dir) continue
      const a = ll(r.origin_airport_id), b = ll(r.destination_airport_id)
      if (!a || !b) continue
      const coordinates = dir === 1 ? greatCirclePoints(a, b, 16) : greatCirclePoints(b, a, 16)
      used.push({ type: 'Feature', properties: { id: r.id, strategy: s, closed: routeClosed(r) }, geometry: { type: 'LineString', coordinates } })
    }
  }
  setData(map, 'used', { type: 'FeatureCollection', features: used })
  setDisplayedStrategy(map, inp.displayedRun)

  // airports + community rings
  const airports: Feature[] = []
  const rings: Feature[] = []
  const comByAirport = new Map(inp.network.communities.map((c) => [c.airport_id, c]))
  for (const a of inp.network.airports) {
    const hub = isHub(a)
    const closed = inp.status.closedAirports.has(a.id)
    const selected = inp.selectedAirport === a.id
    const halo = selected ? 'selected' : hub && closed ? 'closed' : hub ? 'hub' : 'none'
    airports.push({ type: 'Feature', properties: { id: a.id, hub, closed, r: hub ? 6.5 : 4.2, selected, halo }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })
    const c = comByAirport.get(a.id)
    if (c) {
      const isolated = inp.status.structural.has(c.id)
      const disc = inp.status.disconnected.has(c.id)
      if (isolated || disc) {
        rings.push({ type: 'Feature', properties: { id: c.id, r: hub ? 12 : 9.5, color: isolated ? MAP_COLORS.danger : MAP_COLORS.warn }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })
      }
    }
  }
  setData(map, 'airports', { type: 'FeatureCollection', features: airports })
  setData(map, 'community-rings', { type: 'FeatureCollection', features: rings })

  // disruption overlays (area types): an inner disc with a dashed boundary and a
  // softer outer disc at 1.35× (smoke / weather drift). A wildfire/weather event
  // that names airports but has no centre is drawn as a 45 km circle around each.
  const disr: Feature[] = []
  for (const e of inp.effects) {
    if (e.type !== 'wildfire' && e.type !== 'severe_weather') continue
    const active = e.start_min <= inp.t && inp.t < e.end_min
    const color = e.type === 'wildfire' ? MAP_COLORS.wildfire : MAP_COLORS.weather
    const opacity = active ? 0.26 : 0.09
    const lineOpacity = active ? 0.9 : 0.5
    const centres: [LngLat, number][] = []
    if (e.center && e.radius_km) centres.push([[e.center[1], e.center[0]], e.radius_km])
    else for (const id of e.target_ids) { const p = ll(id); if (p) centres.push([p, e.radius_km ?? 45]) }
    for (const [c, r] of centres) {
      disr.push({ type: 'Feature', properties: { id: e.id, kind: e.type, ring: 'outer', color, opacity: opacity * 0.4, lineOpacity: 0, active }, geometry: { type: 'Polygon', coordinates: [circlePolygon(c, r * 1.35)] } })
      disr.push({ type: 'Feature', properties: { id: e.id, kind: e.type, ring: 'inner', color, opacity, lineOpacity, active }, geometry: { type: 'Polygon', coordinates: [circlePolygon(c, r)] } })
    }
  }
  setData(map, 'disruptions', { type: 'FeatureCollection', features: disr })

  // mission arrows (medical / cargo)
  const arrows: Feature[] = []
  const outcomes = new Map((inp.run?.assignments ?? []).map((o) => [o.mission_id, o]))
  for (const m of inp.missions) {
    if (m.type === 'passenger') continue
    const o = outcomes.get(m.id)
    const path = o?.path && o.path.length >= 2 ? o.path : [m.origin, m.dest]
    const st = inp.status.snapshot?.mission_status[m.id]
    const done = st === 'completed' || (o?.complete_min !== null && o?.complete_min !== undefined && inp.t >= o.complete_min)
    const opacity = done ? 0.25 : inp.t < m.release_min ? 0.35 : 0.9
    const color = m.type === 'medical' ? MAP_COLORS.med : MAP_COLORS.cargo
    for (let i = 0; i < path.length - 1; i++) {
      const a = ll(path[i]), b = ll(path[i + 1])
      if (!a || !b) continue
      arrows.push({ type: 'Feature', properties: { id: m.id, color, opacity }, geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, 16) } })
    }
  }
  setData(map, 'mission-arrows', { type: 'FeatureCollection', features: arrows })

  // highlighted decision path: the data stays when the highlight is cleared so it can fade out
  const hl: Feature[] = []
  if (inp.highlightPath && inp.highlightPath.length >= 2) {
    for (let i = 0; i < inp.highlightPath.length - 1; i++) {
      const a = ll(inp.highlightPath[i]), b = ll(inp.highlightPath[i + 1])
      if (a && b) hl.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, 16) } })
    }
  }
  if (hl.length) setData(map, 'highlight-path', { type: 'FeatureCollection', features: hl })
  if (map.getLayer('highlight-glow')) map.setPaintProperty('highlight-glow', 'line-opacity', hl.length ? HIGHLIGHT_GLOW_OPACITY : 0)
  if (map.getLayer('highlight-core')) map.setPaintProperty('highlight-core', 'line-opacity', hl.length ? 1 : 0)
}

const ROLE_COLOR: Record<string, string> = { medevac: MAP_COLORS.med, passenger: MAP_COLORS.pax, combi: MAP_COLORS.combi, utility: MAP_COLORS.util }

/** Short trails: the part of the current leg already flown, per flying aircraft (≤ fleet size features, 9 points each). */
export function updateTrails(map: MlMap, network: NetworkResponse, positions: { id: string; status: string; legFrom: string | null; lngLat: LngLat }[]): void {
  const features: Feature[] = []
  for (const p of positions) {
    if (p.status !== 'flying' || !p.legFrom) continue
    const from = network.airports.find((a) => a.id === p.legFrom)
    if (!from) continue
    const ac = network.aircraft.find((a) => a.id === p.id)
    features.push({
      type: 'Feature', properties: { id: p.id, color: ROLE_COLOR[ac?.role ?? 'utility'] ?? MAP_COLORS.util },
      geometry: { type: 'LineString', coordinates: greatCirclePoints([from.lon, from.lat], p.lngLat, 8) },
    })
  }
  setData(map, 'trails', { type: 'FeatureCollection', features })
}

export function isHub(a: Airport): boolean {
  return a.is_medical_hub || a.is_cargo_hub || a.is_passenger_hub
}
