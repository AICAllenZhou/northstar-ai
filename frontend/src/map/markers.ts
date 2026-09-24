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

export interface LabelMarker { id: string; marker: Marker; el: HTMLElement; lngLat: LngLat; priority: number; width: number }

export function createLabelMarker(map: MlMap, a: Airport): LabelMarker {
  const hub = isHub(a)
  const el = document.createElement('div')
  el.className = `map-label${hub ? ' hub' : ''}`
  el.textContent = a.community_name
  const marker = new Marker({ element: el, anchor: 'left', offset: [hub ? 10 : 8, 0] }).setLngLat([a.lon, a.lat]).addTo(map)
  return { id: a.id, marker, el, lngLat: [a.lon, a.lat], priority: hub ? 0 : 1, width: a.community_name.length * 6.6 + 12 }
}

/** Greedy label decluttering: hubs first, then remaining labels by latitude;
 *  a label that would overlap one already placed is hidden. */
export function declutterLabels(map: MlMap, labels: LabelMarker[], zoom: number): void {
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const H = 16
  const sorted = [...labels].sort((a, b) => a.priority - b.priority || b.lngLat[1] - a.lngLat[1])
  for (const l of sorted) {
    const p = map.project(l.lngLat)
    const box = { x: p.x + 8, y: p.y - H / 2, w: l.width, h: H }
    const hide = (zoom < 2.6 && l.priority > 0) || placed.some((q) => box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y)
    l.el.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) placed.push(box)
  }
}

export interface MissionMarker { id: string; marker: Marker; el: HTMLElement }

const CROSS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/></svg>'
const BOX = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 5l6-3 6 3v7l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v7" stroke="#0a0f15" stroke-width="1.2" fill="none"/></svg>'

export function createMissionMarker(map: MlMap, m: Mission, at: LngLat, onClick: (id: string) => void): MissionMarker {
  const el = document.createElement('div')
  el.className = `mission-marker type-${m.type}`
  el.title = m.label
  el.innerHTML = m.type === 'medical' ? CROSS : BOX
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(m.id) })
  const marker = new Marker({ element: el, anchor: 'center', offset: [-11, -11] }).setLngLat(at).addTo(map)
  return { id: m.id, marker, el }
}

export function setMissionState(mm: MissionMarker, state: 'future' | 'pending' | 'active' | 'done' | 'unserved') {
  mm.el.dataset.state = state
}
