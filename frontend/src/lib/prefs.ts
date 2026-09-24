// Persisted interface preferences (localStorage; every access is guarded).
export const ADVANCED_KEY = 'northstar.advanced'

export function loadAdvanced(): boolean {
  try { return window.localStorage.getItem(ADVANCED_KEY) === '1' } catch { return false }
}

export function saveAdvanced(v: boolean): void {
  try { window.localStorage.setItem(ADVANCED_KEY, v ? '1' : '0') } catch { /* preference simply does not persist */ }
}

export function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
