import { HREF } from '../router'
import { useStore } from '../state/store'
import { FALLBACK_DISCLAIMER } from './copy'

export function SiteFooter() {
  const disclaimer = useStore((s) => s.network?.disclaimer) ?? FALLBACK_DISCLAIMER
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <p className="foot-disc">{disclaimer}</p>
          <p>Built for WAICY · Python, OR-Tools, NetworkX, FastAPI, React, MapLibre · open data: OurAirports, Statistics Canada, Natural Earth</p>
        </div>
        <nav aria-label="Footer">
          <a href={HREF.home}>Home</a>
          <a href={HREF.simulation}>Simulation</a>
          <a href={HREF.research}>Research</a>
          <a href={HREF.data}>Data</a>
          <a href={HREF.about}>About</a>
        </nav>
      </div>
    </footer>
  )
}
