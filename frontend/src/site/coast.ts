// Coastline for the hero loop: Natural Earth province polygons projected with
// the loop's own projection and reduced to SVG path strings. Pure and cheap
// enough to run once per network load; nothing here touches the DOM.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'

export interface CoastPaths {
  /** Nunavut: quiet fill + hairline. */
  nunavut: string
  /** Every other province/territory that reaches the viewBox (NWT, Manitoba, Saskatchewan, Ontario, Québec, Labrador…): fainter fill so the southern gateways sit on land. */
  other: string
  points: number
}

const MIN_RING = 8

function rings(f: Feature): Position[][] {
  const g = f.geometry
  if (g.type === 'Polygon') return (g as Polygon).coordinates
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates.flat()
  return []
}

/** Keeps every `step`-th vertex (always the first and last), then closes the ring. */
function decimate(ring: Position[], step: number): Position[] {
  if (step <= 1) return ring
  const out: Position[] = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i])
  if (out[out.length - 1] !== ring[ring.length - 1]) out.push(ring[ring.length - 1])
  return out
}

function toPath(
  ringList: Position[][], project: (lat: number, lon: number) => { x: number; y: number }, width: number, height: number, budget: number,
): { d: string; points: number } {
  // Drop tiny rings and rings entirely outside the viewBox (generous margin), then decimate to the point budget.
  const margin = 40
  const kept: Position[][] = []
  for (const r of ringList) {
    if (r.length < MIN_RING) continue
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [lon, lat] of r) {
      const p = project(lat, lon)
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
    }
    if (maxX < -margin || minX > width + margin || maxY < -margin || minY > height + margin) continue
    kept.push(r)
  }
  const total = kept.reduce((n, r) => n + r.length, 0)
  const step = Math.max(1, Math.ceil(total / budget))
  let points = 0
  const parts: string[] = []
  for (const r of kept) {
    const pts = decimate(r, step)
    points += pts.length
    parts.push(pts.map(([lon, lat], i) => { const p = project(lat, lon); return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}` }).join('') + 'Z')
  }
  return { d: parts.join(''), points }
}

export function buildCoastPaths(
  provinces: FeatureCollection, project: (lat: number, lon: number) => { x: number; y: number }, width: number, height: number,
): CoastPaths {
  const nun: Position[][] = []
  const other: Position[][] = []
  for (const f of provinces.features) {
    const name = String(f.properties?.name ?? '')
    if (name === 'Nunavut') nun.push(...rings(f))
    else other.push(...rings(f)) // rings outside the viewBox are culled in toPath()
  }
  const a = toPath(nun, project, width, height, 4000)
  const b = toPath(other, project, width, height, 2000)
  return { nunavut: a.d, other: b.d, points: a.points + b.points }
}
