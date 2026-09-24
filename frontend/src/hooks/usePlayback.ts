import { useEffect } from 'react'
import { useStore } from '../state/store'

/** Advances the simulation clock while playing: `speed` simulated minutes per real second. */
export function usePlayback(): void {
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const s = useStore.getState()
      const dt = (now - last) / 1000
      last = now
      const next = s.t + dt * s.speed
      if (next >= 1440) { useStore.setState({ t: 1440, playing: false }); return }
      useStore.setState({ t: next })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
