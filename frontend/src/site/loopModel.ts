// Pure model for the hero "network loop": the real network projected to SVG
// space, plus the closures, cut-off communities and reconnection paths implied
// by a preset's disruptions. No rendering here so the logic is easy to reason about.
import type { NetworkResponse, Scenario } from '../api/types'

export type LoopPhase = 'connected' | 'disrupted' | 'optimized'
export const PHASES: LoopPhase[] = ['connected', 'disrupted', 'optimized']

export interface LoopNode {
  id: string
  name: string
  x: number
  y: number
  hub: boolean
  closed: boolean
  /** Not closed, but its normal shortest path to a hub runs through a closed airport. */
  cut: boolean
  /** A cut-off community that an open multi-hop path can still reach. */
  reconnected: boolean
}

export interface LoopEdge {
  id: string
  a: string
  b: string
  x1: number
  y1: number
  x2: number
  y2: number
  /** Touches a closed airport. */
  closed: boolean
  /** Lies on a reconnection path used in the OPTIMIZED state. */
  opt: boolean
  /** Short fading segment standing in for a route to an omitted southern gateway. */
  stub: boolean
}

export interface LoopModel {
  width: number
  height: number
  nodes: LoopNode[]
  edges: LoopEdge[]
  fire: { x: number; y: number; r: number; label: string } | null
  communityCount: number
  routeCount: number
  closedNames: string[]
  cutNames: string[]
  reconnectedNames: string[]
  isolatedNames: string[]
  hubsUsed: string[]
}

const KM_PER_DEG = 111
const EARTH_KM = 6371

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLon = (lon2 - lon1) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function buildLoopModel(net: NetworkResponse, preset: Scenario | null, width = 640, pad = 40): LoopModel {
  const communityAirports = new Set(net.communities.map((c) => c.airport_id))
  // The southern gateways (airports without a community) are omitted from the drawing.
  const drawn = net.airports.filter((a) => communityAirports.has(a.id))
  const meanLat = drawn.reduce((s, a) => s + a.lat, 0) / Math.max(1, drawn.length)
  const k = Math.cos((meanLat * Math.PI) / 180)
  const xs = drawn.map((a) => a.lon * k)
  const ys = drawn.map((a) => -a.lat)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = (width - 2 * pad) / Math.max(1e-6, maxX - minX)
  const height = Math.round((maxY - minY) * scale + 2 * pad)
  const proj = (lat: number, lon: number) => ({ x: pad + (lon * k - minX) * scale, y: pad + (-lat - minY) * scale })

  // Closures implied by the preset (same thresholds as the simulator's disruption engine).
  const closed = new Set<string>()
  let fire: LoopModel['fire'] = null
  for (const d of preset?.disruptions ?? []) {
    if (d.type === 'wildfire' && d.center_lat !== null && d.center_lon !== null && d.radius_km !== null) {
      if (d.severity >= 0.5) {
        for (const a of net.airports) if (haversineKm(d.center_lat, d.center_lon, a.lat, a.lon) <= d.radius_km) closed.add(a.id)
      }
      const c = proj(d.center_lat, d.center_lon)
      fire = { x: c.x, y: c.y, r: (d.radius_km / KM_PER_DEG) * scale, label: d.label || 'Wildfire' }
    } else if (d.type === 'airport_closure') {
      for (const id of d.target_ids) closed.add(id)
    } else if (d.type === 'severe_weather' && d.severity >= 0.8) {
      for (const id of d.target_ids) closed.add(id)
    }
  }

  // Adjacency over the whole network (gateways included: a route to Winnipeg is a real link).
  const hubs = new Set<string>([...net.hubs.medical, ...net.hubs.cargo, ...net.hubs.passenger])
  const adj = new Map<string, { to: string; km: number }[]>()
  for (const r of net.routes) {
    if (!adj.has(r.origin_airport_id)) adj.set(r.origin_airport_id, [])
    if (!adj.has(r.destination_airport_id)) adj.set(r.destination_airport_id, [])
    adj.get(r.origin_airport_id)!.push({ to: r.destination_airport_id, km: r.distance_km })
    adj.get(r.destination_airport_id)!.push({ to: r.origin_airport_id, km: r.distance_km })
  }
  const isHub = (id: string) => hubs.has(id)

  /** Shortest path (by route distance) from `start` to any hub, avoiding `blocked` airports; null if none. */
  function pathToHub(start: string, blocked: Set<string>): string[] | null {
    const dist = new Map<string, number>([[start, 0]])
    const prev = new Map<string, string>()
    const done = new Set<string>()
    for (;;) {
      let u: string | null = null
      let best = Infinity
      for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; u = id }
      if (u === null) return null
      if (u !== start && isHub(u)) {
        const path = [u]
        while (prev.has(path[0])) path.unshift(prev.get(path[0])!)
        return path
      }
      done.add(u)
      for (const n of adj.get(u) ?? []) {
        if (blocked.has(n.to) || done.has(n.to)) continue
        const nd = best + n.km
        if (nd < (dist.get(n.to) ?? Infinity)) { dist.set(n.to, nd); prev.set(n.to, u) }
      }
    }
  }

  // A community is "cut off" when the closures sever its normal (shortest) path to a hub,
  // which mirrors the simulator's service disconnection. It is "reconnected" when an
  // alternate open path to another hub still exists: that is what NORTHSTAR exploits.
  const NONE = new Set<string>()
  const cut = new Set<string>()
  const reconnected = new Set<string>()
  const optEdges = new Set<string>()
  const hubsUsed = new Set<string>()
  for (const a of drawn) {
    if (closed.has(a.id) || isHub(a.id)) continue
    const normal = pathToHub(a.id, NONE)
    if (!normal || !normal.some((id) => closed.has(id))) continue
    cut.add(a.id)
    const alt = pathToHub(a.id, closed)
    if (!alt) continue
    reconnected.add(a.id)
    hubsUsed.add(alt[alt.length - 1])
    for (let i = 0; i + 1 < alt.length; i++) optEdges.add(edgeKey(alt[i], alt[i + 1]))
  }

  const nodes: LoopNode[] = drawn.map((a) => ({
    id: a.id,
    name: a.community_name,
    ...proj(a.lat, a.lon),
    hub: hubs.has(a.id),
    closed: closed.has(a.id),
    cut: cut.has(a.id),
    reconnected: reconnected.has(a.id),
  }))
  const pos = new Map(nodes.map((n) => [n.id, n]))
  const gatewayPos = new Map(net.airports.filter((a) => !communityAirports.has(a.id)).map((a) => [a.id, proj(a.lat, a.lon)]))
  const STUB = 46
  const edges: LoopEdge[] = []
  for (const r of net.routes) {
    const a = r.origin_airport_id, b = r.destination_airport_id
    const key = edgeKey(a, b)
    const closedEdge = closed.has(a) || closed.has(b)
    if (pos.has(a) && pos.has(b)) {
      const p = pos.get(a)!, q = pos.get(b)!
      edges.push({ id: r.id, a, b, x1: p.x, y1: p.y, x2: q.x, y2: q.y, closed: closedEdge, opt: optEdges.has(key), stub: false })
    } else if (pos.has(a) !== pos.has(b)) {
      // One end is an omitted gateway: draw a short segment pointing towards it.
      const inside = pos.has(a) ? a : b, outside = pos.has(a) ? b : a
      const p = pos.get(inside)!, g = gatewayPos.get(outside)
      if (!g) continue
      const dx = g.x - p.x, dy = g.y - p.y, len = Math.hypot(dx, dy) || 1
      edges.push({ id: r.id, a: inside, b: outside, x1: p.x, y1: p.y, x2: p.x + (dx / len) * STUB, y2: p.y + (dy / len) * STUB, closed: closedEdge, opt: optEdges.has(key), stub: true })
    }
  }

  const nameOf = (id: string) => net.airports.find((a) => a.id === id)?.community_name ?? id
  const byName = (ids: Iterable<string>) => [...ids].map(nameOf).sort()
  return {
    width, height, nodes, edges, fire,
    communityCount: net.communities.length,
    routeCount: net.routes.length,
    closedNames: byName([...closed].filter((id) => communityAirports.has(id))),
    cutNames: byName(cut),
    reconnectedNames: byName(reconnected),
    isolatedNames: byName([...cut].filter((id) => !reconnected.has(id))),
    hubsUsed: byName(hubsUsed),
  }
}

export function listNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function phaseCopy(m: LoopModel, phase: LoopPhase): { label: string; detail: string } {
  if (phase === 'connected' || !m.fire) {
    return { label: 'Connected', detail: `${m.communityCount} communities · ${m.routeCount} routes open` }
  }
  if (phase === 'disrupted') {
    const cause = m.fire.label.toLowerCase().includes('wildfire') ? 'Wildfire smoke' : m.fire.label
    return { label: 'Disrupted', detail: `${cause} closes ${listNames(m.closedNames)} · ${m.cutNames.length} communities cut off` }
  }
  const iso = m.isolatedNames.length ? ` · ${m.isolatedNames.length} still isolated` : ''
  return { label: 'Optimized', detail: `${m.reconnectedNames.length} communities reconnected through ${listNames(m.hubsUsed)}${iso}` }
}
