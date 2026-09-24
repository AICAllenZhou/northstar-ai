import { useEffect, useRef, useState } from 'react'
import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from 'maplibre-gl'
import { aircraftPositionsAt, statusAt, usedRouteIds } from '../lib/derive'
import { snapshotIndex } from '../lib/time'
import { selectDisplayedRun, useStore } from '../state/store'
import { InfoPanel } from './InfoPanel'
import { MapLegend } from './MapLegend'
import { addOverlayLayers, updateOverlays } from './layers'
import {
  createAircraftMarker, createLabelMarker, createMissionMarker, declutterLabels, setAircraftState, setMissionState,
  type AircraftMarker, type LabelMarker, type MissionMarker,
} from './markers'
import { buildStyle } from './style'

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const labelsRef = useRef<LabelMarker[]>([])
  const aircraftRef = useRef<Map<string, AircraftMarker>>(new Map())
  const missionsRef = useRef<Map<string, MissionMarker>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const network = useStore((s) => s.network)

  // 1. Create the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const map = new maplibregl.Map({
      container: el, style: buildStyle(), center: [-88, 66.5], zoom: 3.2, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, minZoom: 1.4, maxZoom: 9, fadeDuration: 0,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => { addOverlayLayers(map); setLoaded(true) })
    map.on('error', (e) => {
      const msg = (e as { error?: Error }).error?.message ?? ''
      if (/basemap|fetch|network/i.test(msg)) setMapError('Basemap layers could not be loaded from /api/basemap.')
    })
    map.on('click', (e) => {
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
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setLoaded(false)
    }
  }, [])

  // 2. Static network content: fit bounds, labels, aircraft markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !network) return
    const north = network.airports.filter((a) => a.region !== 'South gateway')
    const lons = north.map((a) => a.lon), lats = north.map((a) => a.lat)
    const bounds: LngLatBoundsLike = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
    map.fitBounds(bounds, { padding: { top: 50, bottom: 60, left: 90, right: 120 }, duration: 0 })

    labelsRef.current = network.airports.map((a) => createLabelMarker(map, a))
    const declutter = () => declutterLabels(map, labelsRef.current, map.getZoom())
    declutter()
    map.on('moveend', declutter)
    map.on('zoom', declutter)

    const select = useStore.getState().select
    for (const ac of network.aircraft) {
      const home = network.airports.find((a) => a.id === ac.home_airport_id)
      aircraftRef.current.set(ac.id, createAircraftMarker(map, ac, [home?.lon ?? 0, home?.lat ?? 0], (id) => select({ kind: 'aircraft', id })))
    }
    return () => {
      map.off('moveend', declutter)
      map.off('zoom', declutter)
      labelsRef.current.forEach((l) => l.marker.remove())
      labelsRef.current = []
      aircraftRef.current.forEach((m) => m.marker.remove())
      aircraftRef.current.clear()
    }
  }, [loaded, network])

  // 3. Everything that depends on scenario / run / time: overlays, mission
  //    markers and aircraft positions, updated imperatively from the store.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !network) return
    const apt = new Map(network.airports.map((a) => [a.id, a]))
    const select = useStore.getState().select

    const syncMissions = () => {
      const s = useStore.getState()
      const wanted = new Set<string>()
      for (const m of s.scenario?.missions ?? []) {
        if (m.type === 'passenger') continue
        wanted.add(m.id)
        if (!missionsRef.current.has(m.id)) {
          const at = apt.get(m.type === 'medical' ? m.origin : m.dest)
          if (at) missionsRef.current.set(m.id, createMissionMarker(map, m, [at.lon, at.lat], (id) => select({ kind: 'mission', id })))
        }
      }
      for (const [id, mm] of missionsRef.current) if (!wanted.has(id)) { mm.marker.remove(); missionsRef.current.delete(id) }
    }

    const updateSlow = () => {
      const s = useStore.getState()
      const run = selectDisplayedRun(s)
      const status = statusAt(s.scenario, run, s.t, network)
      syncMissions()
      updateOverlays(map, {
        network, status, run, displayedRun: s.displayedRun, usedRoutes: usedRouteIds(network, run),
        missions: s.scenario?.missions ?? [], effects: s.scenario?.disruption_effects ?? [], t: s.t,
        highlightPath: s.highlightPath, selectedAirport: s.selected?.kind === 'airport' ? s.selected.id : null,
      })
      const outcomes = new Map((run?.assignments ?? []).map((o) => [o.mission_id, o]))
      for (const m of s.scenario?.missions ?? []) {
        const mm = missionsRef.current.get(m.id)
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
      for (const p of positions) {
        const m = aircraftRef.current.get(p.id)
        if (!m) continue
        m.marker.setLngLat(p.lngLat)
        setAircraftState(m, p.status, p.bearing, hl.has(p.id), sel === p.id)
      }
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
      missionsRef.current.forEach((m) => m.marker.remove())
      missionsRef.current.clear()
    }
  }, [loaded, network])

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      {mapError && <div className="map-error">{mapError}</div>}
      {!network && !mapError && <div className="map-error muted">Waiting for the network…</div>}
      <InfoPanel />
      <MapLegend />
    </div>
  )
}
