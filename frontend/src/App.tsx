import { useEffect, useState } from 'react'
import { DatasetError, ErrorBanner } from './components/ErrorBanner'
import { DemoStepper } from './components/DemoStepper'
import { PRIMARY_PRESET } from './components/demoSteps'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { Onboarding } from './components/Onboarding'
import { usePlayback } from './hooks/usePlayback'
import { hasOnboarded, markOnboarded } from './lib/onboarding'
import { HREF, navigate, parseHash, replaceHash, TITLES, useRoute, type Page } from './router'
import { useStore, type View } from './state/store'
import { AboutPage } from './site/AboutPage'
import { DataPage } from './site/DataPage'
import { Home } from './site/Home'
import { SiteFooter } from './site/SiteFooter'
import { SiteHeader } from './site/SiteHeader'
import { CommandCenter } from './views/CommandCenter'
import { Research } from './views/Research'

const PAGE_VIEW: Record<Page, View> = { home: 'home', simulation: 'command', research: 'research', data: 'data', about: 'responsible' }

interface DemoState { run: number; preset: string; step: number }

export default function App() {
  const route = useRoute()
  const page = route.page
  const sim = page === 'simulation'
  const datasetError = useStore((s) => s.datasetError)
  const bootstrap = useStore((s) => s.bootstrap)
  const pollHealth = useStore((s) => s.pollHealth)
  const demoRequest = useStore((s) => s.demoRequest)
  const requestDemo = useStore((s) => s.requestDemo)
  // demo.run > 0 means the guided demo is open; the counter keys the stepper so a new start restarts it.
  const [demo, setDemo] = useState<DemoState>({ run: 0, preset: PRIMARY_PRESET, step: 0 })
  // A demo parked on the Research page ("See the 100-scenario results") can be resumed from a small toast.
  const [resume, setResume] = useState<{ preset: string; step: number } | null>(null)
  const [onboard, setOnboard] = useState(false)
  // The command centre mounts on first visit and then stays mounted (the map keeps its state).
  const [simVisited, setSimVisited] = useState(sim)
  if (sim && !simVisited) setSimVisited(true)
  usePlayback()

  useEffect(() => {
    bootstrap().catch(() => undefined)
    const id = setInterval(() => void pollHealth(), 5000)
    return () => clearInterval(id)
  }, [bootstrap, pollHealth])

  // Route → title, legacy store view, page/app scroll mode.
  useEffect(() => {
    document.title = TITLES[page]
    useStore.setState({ view: PAGE_VIEW[page] })
    document.body.classList.toggle('mode-site', !sim)
  }, [page, sim])

  // Route → scroll position (anchor or top) and focus for keyboard users.
  useEffect(() => {
    if (sim) return
    const raf = requestAnimationFrame(() => {
      const target = route.anchor ? document.getElementById(route.anchor) : null
      if (target) target.scrollIntoView()
      else window.scrollTo(0, 0)
      document.getElementById('main')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [route, sim])

  // "#/simulation?demo=1" starts the demo directly; a first plain visit shows the welcome dialog.
  // Deferred so no state is set synchronously inside the effect (same convention as the DemoStepper).
  useEffect(() => {
    if (!sim) return
    const id = setTimeout(() => {
      if (route.params.get('demo') === '1') {
        requestDemo()
        replaceHash(HREF.simulation)
      } else if (!hasOnboarded()) {
        setOnboard(true)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [route, sim, requestDemo])

  // Demo requests from anywhere (header, onboarding, preset cards, resume toast) start or restart the stepper.
  useEffect(() => {
    if (!demoRequest) return
    const id = setTimeout(() => {
      markOnboarded()
      setOnboard(false)
      setResume(null)
      setDemo((d) => ({ run: d.run + 1, preset: demoRequest.preset ?? PRIMARY_PRESET, step: demoRequest.step ?? 0 }))
      if (parseHash(window.location.hash).page !== 'simulation') navigate(HREF.simulation)
    }, 0)
    return () => clearTimeout(id)
  }, [demoRequest])

  // Panels that offer their own "Start guided demo" button hide it while the demo is running.
  useEffect(() => { useStore.setState({ demoActive: demo.run > 0 }) }, [demo.run])

  if (datasetError) return <DatasetError detail={datasetError} />

  const demoOpen = demo.run > 0
  const exitDemo = () => setDemo((d) => ({ ...d, run: 0 }))
  const parkDemo = (step: number, preset: string) => {
    useStore.getState().pause()
    setResume({ preset, step })
    setDemo((d) => ({ ...d, run: 0 }))
    navigate(HREF.research)
  }

  return (
    <div className={`app ${sim ? 'app-sim' : 'app-site'}`}>
      {sim ? <Header onDemo={demoOpen ? exitDemo : () => requestDemo()} demoActive={demoOpen} /> : <SiteHeader page={page} />}
      {sim && <ErrorBanner />}
      <div className="main">
        <div className="view" hidden={!sim}>
          {simVisited && <ErrorBoundary label="Command Center"><CommandCenter /></ErrorBoundary>}
        </div>
        {!sim && (
          <main id="main" className="site-main" tabIndex={-1}>
            {page === 'home' && <ErrorBoundary label="Home"><Home /></ErrorBoundary>}
            {page === 'research' && <ErrorBoundary label="Research Results"><Research active /></ErrorBoundary>}
            {page === 'data' && <ErrorBoundary label="Data"><DataPage /></ErrorBoundary>}
            {page === 'about' && <ErrorBoundary label="About"><AboutPage /></ErrorBoundary>}
          </main>
        )}
      </div>
      {!sim && <SiteFooter />}
      {demoOpen && <ErrorBoundary label="Guided demo"><DemoStepper key={demo.run} preset={demo.preset} initialStep={demo.step} onExit={exitDemo} onPark={parkDemo} /></ErrorBoundary>}
      {resume && !demoOpen && (
        <div className="demo-resume" role="status">
          <span>Guided demo paused at step {resume.step + 1}</span>
          <button type="button" className="btn accent small" onClick={() => requestDemo(resume.preset, resume.step)}>Back to the demo</button>
          <button type="button" className="btn ghost small" aria-label="Dismiss" onClick={() => setResume(null)}>✕</button>
        </div>
      )}
      {sim && onboard && !demoOpen && (
        <Onboarding
          onDemo={() => requestDemo()}
          onExplore={() => { markOnboarded(); setOnboard(false) }}
        />
      )}
    </div>
  )
}
