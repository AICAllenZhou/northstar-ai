import type { StyleSpecification } from 'maplibre-gl'
import { basemapUrl } from '../api/client'

// Fully offline basemap: three Natural Earth GeoJSON layers served by the
// backend, styled as a dark "radar scope": deep ocean, slightly lighter land,
// Nunavut a shade lighter still, darker lakes, thin province borders.
// No glyphs/sprites are declared, so no font or icon requests can ever leave
// the machine; every label is a DOM marker in the system font.
export const MAP_COLORS = {
  ocean: '#08121a',
  land: '#151f2a',
  nunavut: '#1b2735',
  lake: '#0b151d',
  border: '#2c3b4a',
  coast: '#22303c',
  routeNormal: '#34465a',
  routeUsedBaseline: '#a9b6c4',
  routeUsedNorthstar: '#2ee6d6',
  routeUsedDoNothing: '#7d8b9a',
  routeRisk: '#f5a623',
  routeClosed: '#ff4747',
  wildfire: '#ff7a45',
  weather: '#7fa6d9',
  med: '#ff5fa2',
  cargo: '#f5a623',
  pax: '#4c9aff',
  combi: '#b69cff',
  util: '#c3cdd8',
  danger: '#ff4747',
  warn: '#ffb020',
  ns: '#2ee6d6',
}

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'northstar-offline',
    sources: {
      countries: { type: 'geojson', data: basemapUrl('countries') },
      provinces: { type: 'geojson', data: basemapUrl('provinces') },
      lakes: { type: 'geojson', data: basemapUrl('lakes') },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': MAP_COLORS.ocean } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': MAP_COLORS.land } },
      { id: 'nunavut', type: 'fill', source: 'provinces', filter: ['==', ['get', 'name'], 'Nunavut'], paint: { 'fill-color': MAP_COLORS.nunavut } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': MAP_COLORS.lake } },
      { id: 'province-borders', type: 'line', source: 'provinces', paint: { 'line-color': MAP_COLORS.border, 'line-width': 0.8 } },
      { id: 'coast', type: 'line', source: 'countries', paint: { 'line-color': MAP_COLORS.coast, 'line-width': 0.6 } },
    ],
  }
}
