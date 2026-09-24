import { useEffect, useState } from 'react'
import { DatasetError, ErrorBanner } from './components/ErrorBanner'
import { DemoStepper } from './components/DemoStepper'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { usePlayback } from './hooks/usePlayback'
import { useStore } from './state/store'
import { CommandCenter } from './views/CommandCenter'
import { Research } from './views/Research'
import { ResponsibleAI } from './views/ResponsibleAI'

export default function App() {
  const view = useStore((s) => s.view)
  const datasetError = useStore((s) => s.datasetError)
  const bootstrap = useStore((s) => s.bootstrap)
  const pollHealth = useStore((s) => s.pollHealth)
  const [demo, setDemo] = useState(false)
  usePlayback()

  useEffect(() => {
    bootstrap().catch(() => undefined)
    const id = setInterval(() => void pollHealth(), 5000)
    return () => clearInterval(id)
  }, [bootstrap, pollHealth])

  if (datasetError) return <DatasetError detail={datasetError} />

  // All three views stay mounted (the map keeps its state); the inactive ones are hidden.
  return (
    <div className="app">
      <Header onDemo={() => setDemo((d) => !d)} demoActive={demo} />
      <ErrorBanner />
      <div className="main">
        <div className="view" hidden={view !== 'command'}><ErrorBoundary label="Command Center"><CommandCenter /></ErrorBoundary></div>
        <div className="view" hidden={view !== 'research'}><ErrorBoundary label="Research Results"><Research active={view === 'research'} /></ErrorBoundary></div>
        <div className="view" hidden={view !== 'responsible'}><ErrorBoundary label="Responsible AI"><ResponsibleAI /></ErrorBoundary></div>
      </div>
      {demo && <ErrorBoundary label="Demo Mode"><DemoStepper onExit={() => setDemo(false)} /></ErrorBoundary>}
    </div>
  )
}
