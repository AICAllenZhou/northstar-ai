// Spherical geometry helpers (all angles in degrees, distances in km).
const R = 6371.0
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export type LngLat = [number, number]

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * D2R
  const dLon = (lon2 - lon1) * D2R
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Point at fraction f (0..1) along the great circle from a to b. */
export function interpolateGC(a: LngLat, b: LngLat, f: number): LngLat {
  if (f <= 0) return a
  if (f >= 1) return b
  const [lon1, lat1] = [a[0] * D2R, a[1] * D2R]
  const [lon2, lat2] = [b[0] * D2R, b[1] * D2R]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2))
  if (d < 1e-9) return a
  const A = Math.sin((1 - f) * d) / Math.sin(d)
  const B = Math.sin(f * d) / Math.sin(d)
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
  const z = A * Math.sin(lat1) + B * Math.sin(lat2)
  return [Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D]
}

/** Densified great-circle polyline (n segments). */
export function greatCirclePoints(a: LngLat, b: LngLat, n = 24): LngLat[] {
  const pts: LngLat[] = []
  for (let i = 0; i <= n; i++) pts.push(interpolateGC(a, b, i / n))
  return pts
}

/** Initial bearing from a to b in degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = [a[0] * D2R, a[1] * D2R]
  const [lon2, lat2] = [b[0] * D2R, b[1] * D2R]
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  return (Math.atan2(y, x) * R2D + 360) % 360
}

/** Geodesic circle polygon (GeoJSON ring) around a centre, radius in km. */
export function circlePolygon(center: LngLat, radiusKm: number, steps = 64): LngLat[] {
  const [lon, lat] = [center[0] * D2R, center[1] * D2R]
  const ang = radiusKm / R
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(ang) + Math.cos(lat) * Math.sin(ang) * Math.cos(brg))
    const lon2 = lon + Math.atan2(Math.sin(brg) * Math.sin(ang) * Math.cos(lat), Math.cos(ang) - Math.sin(lat) * Math.sin(lat2))
    ring.push([lon2 * R2D, lat2 * R2D])
  }
  return ring
}

/** Graticule for the map: meridians every `lonStep`° and parallels every `latStep`°
 *  over the given box, densified so they stay smooth under any projection. */
export function graticule(
  lon0 = -140, lon1 = -50, lat0 = 50, lat1 = 85, lonStep = 10, latStep = 5,
): { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { kind: 'meridian' | 'parallel' }; geometry: { type: 'LineString'; coordinates: LngLat[] } }[] } {
  const features: { type: 'Feature'; properties: { kind: 'meridian' | 'parallel' }; geometry: { type: 'LineString'; coordinates: LngLat[] } }[] = []
  for (let lon = lon0; lon <= lon1; lon += lonStep) {
    const coordinates: LngLat[] = []
    for (let lat = lat0; lat <= lat1; lat += 1) coordinates.push([lon, lat])
    features.push({ type: 'Feature', properties: { kind: 'meridian' }, geometry: { type: 'LineString', coordinates } })
  }
  for (let lat = lat0; lat <= lat1; lat += latStep) {
    const coordinates: LngLat[] = []
    for (let lon = lon0; lon <= lon1; lon += 2) coordinates.push([lon, lat])
    features.push({ type: 'Feature', properties: { kind: 'parallel' }, geometry: { type: 'LineString', coordinates } })
  }
  return { type: 'FeatureCollection', features }
}
