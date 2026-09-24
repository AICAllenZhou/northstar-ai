import { useEffect, useRef, useState } from 'react'
import { Map as MlMap, NavigationControl, type ErrorEvent, type LngLatBoundsLike, type MapMouseEvent } from 'maplibre-gl'
import { aircraftPositionsAt, statusAt } from '../lib/derive'
import { prefersReducedMotion } from '../lib/prefs'
import { snapshotIndex } from '../lib/time'
import { selectDisplayedRun, useStore } from '../state/store'
import { InfoPanel } from './InfoPanel'
import { MapLegend } from './MapLegend'
import { createFlowController, type FlowController } from './flow'
import { addOverlayLayers, updateOverlays, updateTrails } from './layers'
import {
  createAircraftMarker, createLabelMarker, createMissionMarker, declutterLabels, setAircraftState, setMissionSlot, setMissionState,
  type AircraftMarker, type LabelMarker, type MissionMarker,
} from './markers'
import { buildStyle } from './style'
import './worker'

/** Debug / screenshot hooks (read-only for the app itself): the live map and the flow loop counters. */
declare global {
  interface Window { __northstarMap?: MlMap; __northstarFlow?: FlowController }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const flowRef = useRef<FlowController | null>(null)
  const labelsRef = useRef<LabelMarker[]>([])
  const aircraftRef = useRef<globalThis.Map<string, AircraftMarker>>(new globalThis.Map())
  const missionsRef = useRef<globalThis.Map<string, MissionMarker>>(new globalThis.Map())
  // What sits next to each airport dot (mission boxes, parked aircraft), so the label declutter keeps clear of it;
  // effect 3 maintains the counts and asks effect 2's declutter to run again whenever they change.
  const obstaclesRef = useRef<{ missions: globalThis.Map<string, number>; parked: globalThis.Map<string, number> }>({ missions: new globalThis.Map(), parked: new globalThis.Map() })
  const declutterRef = useRef<() => void>(() => undefined)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const network = useStore((s) => s.network)

  // 1. Create the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const map = new MlMap({
      container: el, style: buildStyle(), center: [-88, 66.5], zoom: 3.2, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, minZoom: 1.4, maxZoom: 9, fadeDuration: 0,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      addOverlayLayers(map, prefersReducedMotion() ? 0 : 500)
      const flow = createFlowController(map)
      flowRef.current = flow
      window.__northstarFlow = flow
      setLoaded(true)
    })
    map.on('error', (e: ErrorEvent) => {
      const msg = e.error?.message ?? ''
      if (/basemap|fetch|network/i.test(msg)) setMapError('Basemap layers could not be loaded from /api/basemap.')
    })
    map.on('click', (e: MapMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: ['airports', 'routes-hit'] })
      const airport = feats.find((f) => f.layer.id === 'airports')
      const route = feats.find((f) => f.layer.id === 'routes-hit')
      const select = useStore.getState().select
      if (airport) select({ kind: 'airport', id: String(airport.properties.id) })
      else if (route) select({ kind: 'route', id: String(route.properties.id) })
      else select(null)
    })
    for (const layer of ['airports', 'routes-hit']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)
    mapRef.current = map
    window.__northstarMap = map
    return () => {
      ro.disconnect()
      flowRef.current?.dispose()
      flowRef.current = null
      map.remove()
      mapRef.current = null
      if (window.__northstarMap === map) delete window.__northstarMap
      delete window.__northstarFlow
      setLoaded(false)
    }
  }, [])

  // 2. Static network content: fit bounds, labels, aircraft markers.
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !loaded || !network || !el) return
    const north = network.airports.filter((a) => a.region !== 'South gateway')
    // Single-column viewport (≤ 1279 px) or a tall map column: fit the populated south (below 72° N,
    // Iqaluit / Rankin Inlet / Cambridge Bay) and let the High Arctic run off the top. The wide
    // three-column layout keeps every community in view.
    const tall = el.clientHeight > el.clientWidth * 1.1 || window.innerWidth < 1280
    const fitTo = tall ? north.filter((a) => a.lat < 72) : north
    const lons = fitTo.map((a) => a.lon), lats = fitTo.map((a) => a.lat)
    const bounds: LngLatBoundsLike = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
    map.fitBounds(bounds, { padding: tall ? { top: 40, bottom: 70, left: 60, right: 60 } : { top: 50, bottom: 60, left: 90, right: 120 }, duration: 0 })

    const labels = network.airports.map((a) => createLabelMarker(map, a))
    labelsRef.current = labels
    const declutter = () => declutterLabels(map, labels, map.getZoom(), obstaclesRef.current)
    declutterRef.current = declutter
    declutter()
    map.on('moveend', declutter)
    map.on('zoom', declutter)

    const select = useStore.getState().select
    const aircraftMarkers = aircraftRef.current
    for (const ac of network.aircraft) {
      const home = network.airports.find((a) => a.id === ac.home_airport_id)
      aircraftMarkers.set(ac.id, createAircraftMarker(map, ac, [home?.lon ?? 0, home?.lat ?? 0], (id) => select({ kind: 'aircraft', id })))
    }
    return () => {
      declutterRef.current = () => undefined
      map.off('moveend', declutter)
      map.off('zoom', declutter)
      labels.forEach((l) => l.marker.remove())
      labelsRef.current = []
      aircraftMarkers.forEach((m) => m.marker.remove())
      aircraftMarkers.clear()
    }
  }, [loaded, network])

  // 3. Everything that depends on scenario / run / time: overlays, mission
  //    markers, aircraft positions and trails, updated imperatively from the store.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !network) return
    const apt = new globalThis.Map(network.airports.map((a) => [a.id, a]))
    const select = useStore.getState().select
    const missionMarkers = missionsRef.current
    const aircraftMarkers = aircraftRef.current
    const flow = flowRef.current

    const obstacles = obstaclesRef.current
    const signature = (m: globalThis.Map<string, number>) => [...m].sort().map(([k, v]) => `${k}:${v}`).join(',')

    const syncMissions = () => {
      const s = useStore.getState()
      const wanted = new Set<string>()
      let changed = false
      for (const m of s.scenario?.missions ?? []) {
        if (m.type === 'passenger') continue
        wanted.add(m.id)
        if (!missionMarkers.has(m.id)) {
          const airportId = m.type === 'medical' ? m.origin : m.dest
          const at = apt.get(airportId)
          if (at) { missionMarkers.set(m.id, createMissionMarker(map, m, airportId, [at.lon, at.lat], (id) => select({ kind: 'mission', id }))); changed = true }
        }
      }
      for (const [id, mm] of missionMarkers) if (!wanted.has(id)) { mm.marker.remove(); missionMarkers.delete(id); changed = true }
      if (!changed) return
      // Missions that share an airport fan out leftwards in id order; the label declutter reserves the same boxes.
      const perAirport = new globalThis.Map<string, MissionMarker[]>()
      for (const mm of missionMarkers.values()) perAirport.set(mm.airportId, [...(perAirport.get(mm.airportId) ?? []), mm])
      obstacles.missions.clear()
      for (const [airportId, list] of perAirport) {
        list.sort((a, b) => a.id.localeCompare(b.id)).forEach((mm, i) => setMissionSlot(mm, i))
        obstacles.missions.set(airportId, list.length)
      }
      declutterRef.current()
    }

    const updateSlow = () => {
      const s = useStore.getState()
      const run = selectDisplayedRun(s)
      const status = statusAt(s.scenario, run, s.t, network)
      syncMissions()
      updateOverlays(map, {
        network, status, run, runs: s.runs, displayedRun: s.displayedRun,
        missions: s.scenario?.missions ?? [], effects: s.scenario?.disruption_effects ?? [], t: s.t,
        highlightPath: s.highlightPath, selectedAirport: s.selected?.kind === 'airport' ? s.selected.id : null,
      })
      flow?.setActive(s.displayedRun !== null)
      const outcomes = new globalThis.Map((run?.assignments ?? []).map((o) => [o.mission_id, o]))
      for (const m of s.scenario?.missions ?? []) {
        const mm = missionMarkers.get(m.id)
        if (!mm) continue
        const o = outcomes.get(m.id)
        const st = status.snapshot?.mission_status[m.id]
        let state: 'future' | 'pending' | 'active' | 'done' | 'unserved' = s.t < m.release_min ? 'future' : 'pending'
        if (run && st === 'completed') state = 'done'
        else if (run && st === 'active') state = 'active'
        else if (run && o?.status === 'unserved' && s.t >= m.release_min) state = 'unserved'
        setMissionState(mm, state)
      }
    }

    const updateFast = () => {
      const s = useStore.getState()
      const run = selectDisplayedRun(s)
      const failedNoRun = statusAt(s.scenario, null, s.t, network).failedAircraft
      const positions = aircraftPositionsAt(network, run, s.t, failedNoRun)
      const hl = new Set(s.highlightAircraft)
      const sel = s.selected?.kind === 'aircraft' ? s.selected.id : s.selected?.kind === 'decision' ? s.decisions.find((d) => d.mission_id === s.selected?.id)?.aircraft_id ?? null : null
      // Aircraft parked at the same airport are fanned out in a row under the
      // airport dot (labels sit to the right, mission icons up-left).
      const parked = new globalThis.Map<string, number>()
      for (const p of positions) if (p.status !== 'flying' && p.airportId) parked.set(p.airportId, (parked.get(p.airportId) ?? 0) + 1)
      if (signature(parked) !== signature(obstacles.parked)) { obstacles.parked = parked; declutterRef.current() }
      const slot = new globalThis.Map<string, number>()
      for (const p of positions) {
        const m = aircraftMarkers.get(p.id)
        if (!m) continue
        let offset: [number, number] = [0, 0]
        if (p.status !== 'flying' && p.airportId) {
          const n = parked.get(p.airportId) ?? 1
          const i = slot.get(p.airportId) ?? 0
          slot.set(p.airportId, i + 1)
          offset = [(i - (n - 1) / 2) * 17, 19]
        }
        m.marker.setLngLat(p.lngLat).setOffset(offset)
        setAircraftState(m, p.status, p.bearing, hl.has(p.id), sel === p.id)
      }
      updateTrails(map, network, positions)
    }

    updateSlow()
    updateFast()
    const unsub = useStore.subscribe((s, prev) => {
      const slow = s.scenario !== prev.scenario || s.displayedRun !== prev.displayedRun || s.runs !== prev.runs
        || snapshotIndex(s.t) !== snapshotIndex(prev.t) || s.highlightPath !== prev.highlightPath || s.selected !== prev.selected
      if (slow) updateSlow()
      if (slow || s.t !== prev.t || s.highlightAircraft !== prev.highlightAircraft) updateFast()
    })
    return () => {
      unsub()
      flow?.setActive(false)
      missionMarkers.forEach((m) => m.marker.remove())
      missionMarkers.clear()
      obstacles.missions.clear()
      obstacles.parked = new globalThis.Map()
    }
  }, [loaded, network])

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      {mapError && <div className="map-error">{mapError}</div>}
      {!network && !mapError && <div className="map-error muted">Waiting for the network…</div>}
      {/* Bottom-left corner: the legend (collapsible) stacked above the info panel, so neither covers the other. */}
      <div className="map-corner">
        <MapLegend />
        <InfoPanel />
      </div>
    </div>
  )
}
