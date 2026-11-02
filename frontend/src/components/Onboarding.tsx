import { useEffect, useRef } from 'react'

/** First-visit welcome over the command centre. Focus is trapped; Escape = explore. */
export function Onboarding({ onDemo, onExplore }: { onDemo: () => void; onExplore: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    el.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onExplore(); return }
      if (e.key !== 'Tab') return
      const f = [...el.querySelectorAll<HTMLElement>('button, a[href]')]
      if (f.length === 0) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [onExplore])

  return (
    <div className="onboard-backdrop">
      <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="onb-h" aria-describedby="onb-p" ref={ref}>
        <p className="eyebrow-brief">Welcome</p>
        <h2 id="onb-h">Welcome to the NORTHSTAR command center</h2>
        <p id="onb-p">Real Nunavut geography, a synthetic fleet and schedule, and two dispatch strategies you can compare on the same disruption.</p>
        <div className="onboard-actions">
          <button type="button" className="btn accent big" onClick={onDemo}>Start guided demo <span className="sub">· about 4 minutes</span></button>
          <button type="button" className="btn ghost big" onClick={onExplore}>Explore on my own</button>
        </div>
      </div>
    </div>
  )
}
