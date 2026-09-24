// First-entry flag for the simulation's welcome dialog (per browser session).
export const ONBOARDED_KEY = 'northstar.onboarded'

export function hasOnboarded(): boolean {
  try { return window.sessionStorage.getItem(ONBOARDED_KEY) === '1' } catch { return false }
}

export function markOnboarded(): void {
  try { window.sessionStorage.setItem(ONBOARDED_KEY, '1') } catch { /* storage unavailable: dialog simply shows again */ }
}
