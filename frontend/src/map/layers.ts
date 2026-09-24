import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Airport, DisruptionEffect, Mission, NetworkResponse, RunResult, StrategyName } from '../api/types'
import type { StatusAt } from '../lib/derive'
import { circlePolygon, greatCirclePoints, type LngLat } from './geo'
import { MAP_COLORS } from './style'

import type { Feature, FeatureCollection } from 'geojson'
type FC = FeatureCollection
const EMPTY: FC = { type: 'FeatureCollection', features: [] }

export const SOURCES = ['disruptions', 'routes', 'mission-arrows', 'highlight-path', 'community-rings', 'airports'] as const

/** Adds the empty overlay sources and their layers once the style has loaded. */
export function addOverlayLayers(map: MlMap): void {
  for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: EMPTY })

  map.addLayer({
    id: 'disruptions-fill', type: 'fill', source: 'disruptions',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
  })
  map.addLayer({
    id: 'disruptions-line', type: 'line', source: 'disruptions',
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.2, 'line-opacity': ['get', 'lineOpacity'], 'line-dasharray': [3, 2] },
  })
  map.addLayer({
    id: 'routes-open', type: 'line', source: 'routes', filter: ['!=', ['get', 'state'], 'closed'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['match', ['get', 'state'], 'used', 2.6, 'risk', 1.6, 1.1],
      'line-opacity': ['match', ['get', 'state'], 'used', 0.95, 'risk', 0.9, 0.8],
    },
  })
  map.addLayer({
    id: 'routes-closed', type: 'line', source: 'routes', filter: ['==', ['get', 'state'], 'closed'],
    paint: { 'line-color': MAP_COLORS.routeClosed, 'line-width': 1.6, 'line-dasharray': [2, 2] },
  })
  map.addLayer({
    id: 'routes-hit', type: 'line', source: 'routes',
    paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 },
  })
  map.addLayer({
    id: 'highlight-glow', type: 'line', source: 'highlight-path',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_COLORS.ns, 'line-width': 9, 'line-opacity': 0.28, 'line-blur': 2 },
  })
  map.addLayer({
    id: 'highlight-core', type: 'line', source: 'highlight-path',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_COLORS.ns, 'line-width': 2.5 },
  })
  map.addLayer({
    id: 'mission-arrows', type: 'line', source: 'mission-arrows',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1.2, 1.6] },
  })
  map.addLayer({
    id: 'community-rings', type: 'circle', source: 'community-rings',
    paint: {
      'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2.2, 'circle-stroke-opacity': 0.95,
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

export interface OverlayInput {
  network: NetworkResponse
  status: StatusAt
  run: RunResult | null
  displayedRun: StrategyName | null
  usedRoutes: Set<string>
  missions: Mission[]
  effects: DisruptionEffect[]
  t: number
  highlightPath: string[] | null
  selectedAirport: string | null
}

export function updateOverlays(map: MlMap, inp: OverlayInput): void {
  const apt = new Map(inp.network.airports.map((a) => [a.id, a]))
  const ll = (id: string): LngLat | null => { const a = apt.get(id); return a ? [a.lon, a.lat] : null }
  const usedColor = inp.displayedRun === 'northstar' ? MAP_COLORS.routeUsedNorthstar
    : inp.displayedRun === 'baseline' ? MAP_COLORS.routeUsedBaseline : MAP_COLORS.routeUsedDoNothing

  // routes
  const routes: Feature[] = []
  for (const r of inp.network.routes) {
    const a = ll(r.origin_airport_id), b = ll(r.destination_airport_id)
    if (!a || !b) continue
    const closed = inp.status.closedRoutes.has(r.id) || inp.status.closedAirports.has(r.origin_airport_id) || inp.status.closedAirports.has(r.destination_airport_id)
    const risk = inp.status.routeRisk[r.id] ?? r.base_risk
    const state = closed ? 'closed' : inp.usedRoutes.has(r.id) ? 'used' : risk > 0.3 ? 'risk' : 'normal'
    const color = state === 'used' ? usedColor : state === 'risk' ? MAP_COLORS.routeRisk : MAP_COLORS.routeNormal
    routes.push({ type: 'Feature', properties: { id: r.id, state, color, risk }, geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, 16) } })
  }
  // draw "used" on top of normal ones
  routes.sort((x, y) => (x.properties!.state === 'used' ? 1 : 0) - (y.properties!.state === 'used' ? 1 : 0))
  setData(map, 'routes', { type: 'FeatureCollection', features: routes })

  // airports + community rings
  const airports: Feature[] = []
  const rings: Feature[] = []
  const comByAirport = new Map(inp.network.communities.map((c) => [c.airport_id, c]))
  for (const a of inp.network.airports) {
    const hub = isHub(a)
    const closed = inp.status.closedAirports.has(a.id)
    airports.push({ type: 'Feature', properties: { id: a.id, hub, closed, r: hub ? 6.5 : 4.2, selected: inp.selectedAirport === a.id }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })
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

  // disruption overlays (area types); a wildfire/weather event that names
  // airports but has no centre is drawn as a 45 km circle around each airport.
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
      disr.push({ type: 'Feature', properties: { id: e.id, kind: e.type, color, opacity, lineOpacity, active }, geometry: { type: 'Polygon', coordinates: [circlePolygon(c, r)] } })
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

  // highlighted decision path
  const hl: Feature[] = []
  if (inp.highlightPath && inp.highlightPath.length >= 2) {
    for (let i = 0; i < inp.highlightPath.length - 1; i++) {
      const a = ll(inp.highlightPath[i]), b = ll(inp.highlightPath[i + 1])
      if (a && b) hl.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, 16) } })
    }
  }
  setData(map, 'highlight-path', { type: 'FeatureCollection', features: hl })
}

export function isHub(a: Airport): boolean {
  return a.is_medical_hub || a.is_cargo_hub || a.is_passenger_hub
}
