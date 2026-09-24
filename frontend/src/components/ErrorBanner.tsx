import { useStore } from '../state/store'

/** Connection banner (top), transient error toasts (bottom-right) and the
 *  full-screen dataset error. Never lets a failure go silent. */
export function ErrorBanner() {
  const connection = useStore((s) => s.connection)
  const errors = useStore((s) => s.errors)
  const dismiss = useStore((s) => s.dismissError)
  const pollHealth = useStore((s) => s.pollHealth)
  const ready = useStore((s) => s.ready)
  const bootstrap = useStore((s) => s.bootstrap)
  const retry = () => { void pollHealth().then(() => { if (!useStore.getState().ready) void bootstrap() }) }
  return (
    <>
      {connection === 'down' && (
        <div className="conn-banner" role="alert">
          <span className="lamp" aria-hidden />
          <strong>Backend unreachable.</strong>
          <span>Controls are disabled; the last known state is kept. Retrying every 5 s. Start it with <code>uv run uvicorn northstar.api.main:app --port 8000</code>.</span>
          <button className="btn small" onClick={retry}>Retry now</button>
        </div>
      )}
      {!ready && connection === 'ok' && (
        <div className="conn-banner soft" role="status"><span className="spinner" /> Loading network…</div>
      )}
      <div className="toasts" aria-live="assertive">
        {errors.map((e) => (
          <div key={e.id} className="toast">
            <span>{e.message}</span>
            <div className="toast-actions">
              {e.retry && <button className="btn small" onClick={() => { dismiss(e.id); e.retry?.() }}>Retry</button>}
              <button className="btn small ghost" onClick={() => dismiss(e.id)} aria-label="Dismiss">✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function DatasetError({ detail }: { detail: string }) {
  const pollHealth = useStore((s) => s.pollHealth)
  return (
    <div className="dataset-error" role="alert">
      <div>
        <div className="eyebrow">503 · dataset missing</div>
        <h2>NORTHSTAR cannot start: a dataset file is missing</h2>
        <p>The backend reported:</p>
        <pre>{detail}</pre>
        <p>Rebuild the processed datasets with <code>python3 scripts/build_datasets.py</code> from the repository root, then retry.</p>
        <button className="btn accent" onClick={() => void pollHealth()}>Retry</button>
      </div>
    </div>
  )
}
