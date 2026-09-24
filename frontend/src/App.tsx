import { useEffect, useState } from 'react'
import { DatasetError, ErrorBanner } from './components/ErrorBanner'
import { DemoStepper } from './components/DemoStepper'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { Onboarding } from './components/Onboarding'
import { usePlayback } from './hooks/usePlayback'
import { hasOnboarded, markOnboarded } from './lib/onboarding'
import { HREF, replaceHash, TITLES, useRoute, type Page } from './router'
import { useStore, type View } from './state/store'
import { AboutPage } from './site/AboutPage'
import { DataPage } from './site/DataPage'
import { Home } from './site/Home'
import { SiteFooter } from './site/SiteFooter'
import { SiteHeader } from './site/SiteHeader'
import { CommandCenter } from './views/CommandCenter'
import { Research } from './views/Research'

const PAGE_VIEW: Record<Page, View> = { home: 'home', simulation: 'command', research: 'research', data: 'data', about: 'responsible' }

export default function App() {
  const route = useRoute()
  const page = route.page
  const sim = page === 'simulation'
  const datasetError = useStore((s) => s.datasetError)
  const bootstrap = useStore((s) => s.bootstrap)
  const pollHealth = useStore((s) => s.pollHealth)
  // demoRun > 0 means the guided demo is open; the counter keys the stepper so a new start restarts it.
  const [demoRun, setDemoRun] = useState(0)
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
        markOnboarded()
        setOnboard(false)
        setDemoRun((n) => n + 1)
        replaceHash(HREF.simulation)
      } else if (!hasOnboarded()) {
        setOnboard(true)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [route, sim])

  if (datasetError) return <DatasetError detail={datasetError} />

  const demo = demoRun > 0
  const startDemo = () => setDemoRun((n) => n + 1)
  const exitDemo = () => setDemoRun(0)

  return (
    <div className={`app ${sim ? 'app-sim' : 'app-site'}`}>
      {sim ? <Header onDemo={demo ? exitDemo : startDemo} demoActive={demo} /> : <SiteHeader page={page} />}
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
      {demo && <ErrorBoundary label="Demo Mode"><DemoStepper key={demoRun} onExit={exitDemo} /></ErrorBoundary>}
      {sim && onboard && !demo && (
        <Onboarding
          onDemo={() => { markOnboarded(); setOnboard(false); startDemo() }}
          onExplore={() => { markOnboarded(); setOnboard(false) }}
        />
      )}
    </div>
  )
}
