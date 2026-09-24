// Tiny hash router. Routes: #/  #/simulation  #/research  #/data  #/about
// "#/simulation?demo=1" opens the simulation and starts the guided demo;
// "#/about#responsible-ai" opens About scrolled to that section.
// Hash routing survives the static host (the backend serves index.html at "/").
import { useMemo, useSyncExternalStore } from 'react'

export type Page = 'home' | 'simulation' | 'research' | 'data' | 'about'
export const PAGES: Page[] = ['home', 'simulation', 'research', 'data', 'about']

export interface Route {
  page: Page
  params: URLSearchParams
  anchor: string | null
  hash: string
}

export const HREF: Record<Page, string> = {
  home: '#/',
  simulation: '#/simulation',
  research: '#/research',
  data: '#/data',
  about: '#/about',
}

export const TITLES: Record<Page, string> = {
  home: 'NORTHSTAR AI — Air connectivity and resilience for Northern Canada',
  simulation: 'Simulation · NORTHSTAR AI',
  research: 'Research · NORTHSTAR AI',
  data: 'Data · NORTHSTAR AI',
  about: 'About · NORTHSTAR AI',
}

export function parseHash(hash: string): Route {
  let h = hash.startsWith('#') ? hash.slice(1) : hash
  let anchor: string | null = null
  const ai = h.indexOf('#')
  if (ai >= 0) { anchor = h.slice(ai + 1) || null; h = h.slice(0, ai) }
  let query = ''
  const qi = h.indexOf('?')
  if (qi >= 0) { query = h.slice(qi + 1); h = h.slice(0, qi) }
  const path = h.replace(/^\/+|\/+$/g, '')
  const page: Page = (PAGES as string[]).includes(path) ? (path as Page) : 'home'
  return { page, params: new URLSearchParams(query), anchor, hash }
}

/** Navigate by setting the hash (adds a history entry, fires hashchange). */
export function navigate(href: string) {
  if (typeof window === 'undefined') return
  if (window.location.hash === href) return
  window.location.hash = href
}

/** Rewrite the current hash without a history entry (used to drop "?demo=1"). */
export function replaceHash(href: string) {
  if (typeof window === 'undefined' || window.location.hash === href) return
  window.history.replaceState(null, '', href)
  window.dispatchEvent(new Event('hashchange'))
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getSnapshot = () => window.location.hash
const getServerSnapshot = () => ''

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => parseHash(hash), [hash])
}
