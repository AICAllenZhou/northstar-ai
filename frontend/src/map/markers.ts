import { Marker, type Map as MlMap } from 'maplibre-gl'
import type { Aircraft, Airport, Mission } from '../api/types'
import type { LngLat } from './geo'
import { isHub } from './layers'

// Material "flight" glyph, nose pointing north; rotated by bearing.
const PLANE_PATH = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'

export interface AircraftMarker { id: string; marker: Marker; el: HTMLElement; icon: SVGElement }

export function createAircraftMarker(map: MlMap, ac: Aircraft, at: LngLat, onClick: (id: string) => void): AircraftMarker {
  const el = document.createElement('div')
  el.className = `ac-marker role-${ac.role}`
  el.setAttribute('data-id', ac.id)
  el.title = `${ac.id} · ${ac.type}`
  el.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${PLANE_PATH}"/><line class="cross" x1="4" y1="4" x2="20" y2="20"/></svg><span class="ac-id">${ac.id.replace('AC-', '')}</span>`
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(ac.id) })
  const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map)
  return { id: ac.id, marker, el, icon: el.querySelector('svg') as SVGElement }
}

export function setAircraftState(m: AircraftMarker, status: string, bearing: number | null, highlighted: boolean, selected: boolean) {
  m.el.classList.toggle('flying', status === 'flying')
  m.el.classList.toggle('failed', status === 'failed')
  m.el.classList.toggle('stranded', status === 'stranded')
  m.el.classList.toggle('highlight', highlighted)
  m.el.classList.toggle('selected', selected)
  m.icon.style.transform = bearing === null ? '' : `rotate(${bearing.toFixed(1)}deg)`
}

export interface LabelMarker { id: string; marker: Marker; el: HTMLElement; lngLat: LngLat; priority: number; width: number; hub: boolean; /** current marker offset */ at: [number, number] }

/** Per-airport counts of the DOM markers that sit next to the dot, so labels can keep clear of them:
 *  mission boxes (up-left of the dot) and the row of parked aircraft (below it). */
export interface LabelObstacles { missions: ReadonlyMap<string, number>; parked: ReadonlyMap<string, number> }

const LABEL_H = 16
const LABEL_DX = { hub: 10, community: 8 }
/** Alternative placements for a community label: beside the dot (right), just below, just above, then to the left
 *  of the dot (`left: true`, the text ends LABEL_DX before the dot; the marker keeps its left anchor and the
 *  measured width gives the offset). Hubs never move. */
const LABEL_ROWS: { dy: number; left?: boolean }[] = [{ dy: 0 }, { dy: LABEL_H - 3 }, { dy: -(LABEL_H - 3) }, { dy: 0, left: true }]
/** Mission box: 22 px square whose centre sits up-left of the airport dot, far enough that the box and its
 *  5 px pulse ring stay above the label row (|dy| − 11 − 5 > LABEL_H / 2) and left of the label text. */
export const MISSION_BOX = 22
export const MISSION_RING = 5
export const MISSION_OFFSET: [number, number] = [-15, -22]
/** Several missions at one airport fan out leftwards, centre to centre. */
export const MISSION_GAP = 25
/** Parked aircraft row (MapView.updateFast): 26 px glyphs every 17 px, centred 19 px under the dot, id text 8 px below the glyph. */
const PLANE = { w: 26, h: 26, dy: 19, step: 17, idH: 8 }

export function createLabelMarker(map: MlMap, a: Airport): LabelMarker {
  const hub = isHub(a)
  const el = document.createElement('div')
  el.className = `map-label${hub ? ' hub' : ''}`
  el.textContent = a.community_name
  const marker = new Marker({ element: el, anchor: 'left', offset: [hub ? LABEL_DX.hub : LABEL_DX.community, 0] }).setLngLat([a.lon, a.lat]).addTo(map)
  return { id: a.id, marker, el, lngLat: [a.lon, a.lat], priority: hub ? 0 : 1, width: a.community_name.length * 6.6 + 12, hub, at: [hub ? LABEL_DX.hub : LABEL_DX.community, 0] }
}

interface Box { x: number; y: number; w: number; h: number }
const hits = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** Greedy label decluttering. Hub labels are placed first and are always visible. A community label takes the
 *  first of its three rows (beside, below, above) that overlaps neither a placed label nor a reserved box
 *  (mission markers, parked-aircraft rows); if none is free it is hidden. Below zoom 2.6 only hubs are shown. */
export function declutterLabels(map: MlMap, labels: LabelMarker[], zoom: number, obstacles?: LabelObstacles): void {
  // Read phase: real text widths (the fonts may have arrived after the markers were created) and the reserved boxes.
  for (const l of labels) { const w = l.el.offsetWidth; if (w) l.width = w }
  const reserved: Box[] = []
  if (obstacles) {
    for (const l of labels) {
      const nm = obstacles.missions.get(l.id) ?? 0, np = obstacles.parked.get(l.id) ?? 0
      if (!nm && !np) continue
      const p = map.project(l.lngLat)
      if (nm) {
        const half = MISSION_BOX / 2 + MISSION_RING
        reserved.push({ x: p.x + MISSION_OFFSET[0] - (nm - 1) * MISSION_GAP - half, y: p.y + MISSION_OFFSET[1] - half, w: half * 2 + (nm - 1) * MISSION_GAP, h: half * 2 })
      }
      if (np) {
        const half = ((np - 1) / 2) * PLANE.step + PLANE.w / 2
        reserved.push({ x: p.x - half, y: p.y + PLANE.dy - PLANE.h / 2, w: half * 2, h: PLANE.h + PLANE.idH })
      }
    }
  }
  const placed: Box[] = []
  const sorted = [...labels].sort((a, b) => a.priority - b.priority || b.lngLat[1] - a.lngLat[1])
  const result: { l: LabelMarker; at: [number, number] | null }[] = []
  for (const l of sorted) {
    const p = map.project(l.lngLat)
    const dx = l.hub ? LABEL_DX.hub : LABEL_DX.community
    let at: [number, number] | null = null
    if (l.hub) {
      at = [dx, 0]
      placed.push({ x: p.x + dx, y: p.y - LABEL_H / 2, w: l.width, h: LABEL_H })
    } else if (zoom >= 2.6) {
      for (const row of LABEL_ROWS) {
        const ox = row.left ? -(dx + l.width) : dx
        const box = { x: p.x + ox, y: p.y - LABEL_H / 2 + row.dy, w: l.width, h: LABEL_H }
        if (placed.some((q) => hits(box, q)) || reserved.some((q) => hits(box, q))) continue
        at = [ox, row.dy]
        placed.push(box)
        break
      }
    }
    result.push({ l, at })
  }
  // Write phase.
  for (const { l, at } of result) {
    l.el.style.visibility = at === null ? 'hidden' : 'visible'
    if (at !== null && (at[0] !== l.at[0] || at[1] !== l.at[1])) { l.marker.setOffset(at); l.at = at }
  }
}

export interface MissionMarker { id: string; marker: Marker; el: HTMLElement; airportId: string }

const CROSS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/></svg>'
const BOX = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 5l6-3 6 3v7l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v7" stroke="#0a0f15" stroke-width="1.2" fill="none"/></svg>'

export function createMissionMarker(map: MlMap, m: Mission, airportId: string, at: LngLat, onClick: (id: string) => void): MissionMarker {
  const el = document.createElement('div')
  el.className = `mission-marker type-${m.type}`
  el.title = m.label
  el.innerHTML = m.type === 'medical' ? CROSS : BOX
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(m.id) })
  const marker = new Marker({ element: el, anchor: 'center', offset: MISSION_OFFSET }).setLngLat(at).addTo(map)
  return { id: m.id, marker, el, airportId }
}

/** Slot 0 is up-left of the dot; further missions at the same airport continue leftwards. */
export function setMissionSlot(mm: MissionMarker, slot: number) {
  mm.marker.setOffset([MISSION_OFFSET[0] - slot * MISSION_GAP, MISSION_OFFSET[1]])
}

export function setMissionState(mm: MissionMarker, state: 'future' | 'pending' | 'active' | 'done' | 'unserved') {
  mm.el.dataset.state = state
}
