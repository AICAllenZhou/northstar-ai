// Landing-page motion helpers: one-shot section reveals, an in-view flag and a
// number count-up. All three are inert under prefers-reduced-motion.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from '../lib/prefs'
import { parseHash } from '../router'

const REVEAL_SELECTOR = '.reveal'

/** Marks every `.reveal` element `in` when it enters the viewport (threshold 0.15, once).
 *  Skipped (everything shown at once) under reduced motion, when the page was opened
 *  with an anchor (jump straight to the section) or without IntersectionObserver. */
export function useRevealOnScroll(): void {
  useEffect(() => {
    const root = document.getElementById('main') ?? document.body
    const all = () => root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)
    const showAll = () => all().forEach((el) => el.classList.add('in'))
    const anchored = !!parseHash(window.location.hash).anchor
    if (prefersReducedMotion() || anchored || !('IntersectionObserver' in window)) { showAll(); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }, { threshold: 0.15 })
    all().forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/** True once the element has been ≥ `threshold` visible (stays true). */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.15): boolean {
  // Without IntersectionObserver the element counts as seen from the start.
  const [seen, setSeen] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen, threshold])
  return seen
}

/** Eases a number from `from` to `to` over `ms` once `run` is true; returns `to` at once under reduced motion. */
export function useCountUp(from: number, to: number, run: boolean, ms = 600): number {
  const [v, setV] = useState(from)
  const started = useRef(false)
  const instant = from === to || prefersReducedMotion()
  useEffect(() => {
    if (!run || instant || started.current) return
    started.current = true
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - (1 - p) * (1 - p) * (1 - p) // ease-out cubic
      setV(from + (to - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, instant, from, to, ms])
  return run && !instant ? v : to
}
