import type { NetworkResponse } from '../api/types'
import { useStore } from '../state/store'
import { NOT_DONE, PROVENANCE_ROWS, REBUILD_CMD, type DataKind } from './copy'
import { DataColumns } from './DataColumns'

interface DatasetMeta {
  dataset?: string
  real_or_synthetic?: string
  real_fields?: Record<string, string>
  synthetic_fields?: Record<string, string>
  source_urls?: string[]
  licence?: string
  assumptions?: string[]
}

const ORDER = ['airports', 'communities', 'routes', 'aircraft', 'schedule', 'basemap']

/** "host › last-path-segment" so long download URLs stay readable; the href keeps the full URL. */
function linkText(u: string): string {
  try {
    const { host, pathname } = new URL(u)
    const last = pathname.split('/').filter(Boolean).pop()
    return last ? `${host} › ${last}` : host
  } catch { return u }
}
const KIND: Record<string, { cls: string; label: string }> = {
  real: { cls: 'real', label: 'Real' },
  mixed: { cls: 'mixed', label: 'Mixed' },
  synthetic: { cls: 'syn', label: 'Synthetic' },
}
const BADGE: Record<DataKind, { cls: string; label: string }> = { real: { cls: 'real', label: 'Real' }, synthetic: { cls: 'syn', label: 'Synthetic' }, derived: { cls: 'derived', label: 'Derived' } }

/** "28 airports" from /api/network, or nothing while the backend has not answered. */
function countText(network: NetworkResponse | null, key: 'airports' | 'communities' | 'routes' | 'aircraft' | 'schedule' | null, unit: string): string | null {
  if (!network || !key) return null
  return `${network[key].length} ${unit}`
}

export function DataPage() {
  const network = useStore((s) => s.network)
  const connection = useStore((s) => s.connection)
  const meta = (network?.metadata ?? {}) as Record<string, DatasetMeta>
  const names = [...ORDER.filter((k) => k in meta), ...Object.keys(meta).filter((k) => !ORDER.includes(k))]

  return (
    <article className="page data-page">
      <header className="page-head wrap">
        <p className="eyebrow-brief">Data</p>
        <h1>Data and provenance</h1>
        <p className="lead">Every number shown in NORTHSTAR is either traceable to a named public source or labelled synthetic. Synthetic operational data is never presented as real Canadian aviation data.</p>
      </header>

      <section className="wrap" aria-labelledby="rs-h">
        <h2 id="rs-h">Real versus synthetic</h2>
        <DataColumns expanded />
      </section>

      <section className="wrap" aria-labelledby="prov-h">
        <h2 id="prov-h">Provenance, one row per dataset</h2>
        <p>Source, licence and use for everything the simulation runs on. Counts come from the local API; the facts are those of <code>docs/DATA_PROVENANCE.md</code>.</p>
        <div className="table-scroll">
          <table className="ds-table prov-table">
            <colgroup><col className="p-name" /><col className="p-kind" /><col className="p-src" /><col className="p-lic" /><col className="p-use" /></colgroup>
            <thead><tr><th>Dataset</th><th>Kind</th><th>Source</th><th>Licence</th><th>Used for</th></tr></thead>
            <tbody>
              {PROVENANCE_ROWS.map((r) => {
                const count = countText(network, r.countOf, r.countUnit)
                return (
                  <tr key={r.dataset}>
                    <td>{r.dataset}{count && <span className="fields mono">{count}</span>}</td>
                    <td><span className={`chip ${BADGE[r.kind].cls}`}>{BADGE[r.kind].label}</span></td>
                    <td>{r.source}</td>
                    <td>{r.licence}</td>
                    <td>{r.usedFor}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="prov-legend"><span className="chip real">Real</span> traceable to a named public download · <span className="chip derived">Derived</span> computed from real data by a stated formula · <span className="chip syn">Synthetic</span> invented for the simulation and labelled as such.</p>
      </section>

      <section className="wrap" aria-labelledby="notdone-h">
        <h2 id="notdone-h">What we deliberately did not do</h2>
        <ul className="notdone">
          {NOT_DONE.map((n) => <li key={n.t}><h3>{n.t}</h3><p>{n.p}</p></li>)}
        </ul>
      </section>

      <section className="wrap" aria-labelledby="ds-h">
        <h2 id="ds-h">Processed datasets, from the sidecars</h2>
        <p>Each file under <code>datasets/processed/</code> carries a machine-readable sidecar (<code>*.meta.json</code>) that states what is real, what is synthetic, and under which licence. This table is read from those sidecars through the local API.</p>
        {names.length === 0 ? (
          <div className="ev-note" role="status">
            {connection === 'down' ? 'Dataset metadata is served by the local NORTHSTAR backend, which is not answering.' : 'Loading dataset metadata…'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="ds-table">
              <colgroup><col className="c-name" /><col className="c-kind" /><col className="c-src" /><col className="c-lic" /><col className="c-ass" /></colgroup>
              <thead>
                <tr><th>Dataset</th><th>Real / synthetic</th><th>Sources</th><th>Licence</th><th>Assumptions</th></tr>
              </thead>
              <tbody>
                {names.map((k) => {
                  const m = meta[k]
                  const kind = KIND[m.real_or_synthetic ?? ''] ?? { cls: '', label: m.real_or_synthetic ?? '—' }
                  return (
                    <tr key={k}>
                      <td>
                        {m.dataset ?? k}
                        {m.real_fields && <span className="fields"><b>Real:</b> {Object.entries(m.real_fields).map(([f, s]) => `${f} — ${s}`).join('; ')}</span>}
                        {m.synthetic_fields && <span className="fields"><b>Synthetic:</b> {Object.entries(m.synthetic_fields).map(([f, s]) => (f === 'all' ? s : `${f} — ${s}`)).join('; ')}</span>}
                      </td>
                      <td><span className={`chip ${kind.cls}`}>{kind.label}</span></td>
                      <td>
                        {m.source_urls?.length ? (
                          <ul>{m.source_urls.map((u) => <li key={u}><a href={u} rel="noreferrer">{linkText(u)}</a></li>)}</ul>
                        ) : <span className="muted">Project assumption, declared in the sidecar</span>}
                      </td>
                      <td>{m.licence ?? <span className="muted">Not applicable (synthetic)</span>}</td>
                      <td>{m.assumptions?.length ? <ul>{m.assumptions.map((a) => <li key={a}>{a}</li>)}</ul> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wrap" aria-labelledby="flag-h">
        <h2 id="flag-h">Two runways from a secondary source</h2>
        <p>OurAirports has no runway rows for Grise Fiord (CYGZ) and Kimmirut (CYLC), and records the surface as unknown for Whale Cove (CYXN) and Chesterfield Inlet (CYCS). Those four values come from Wikipedia airport infoboxes, which cite the Canada Flight Supplement (Nav Canada). They are flagged per airport in the <code>data_flags</code> column and shown as “secondary source” wherever they appear.</p>
      </section>

      <section className="wrap" aria-labelledby="rebuild-h">
        <h2 id="rebuild-h">How to rebuild</h2>
        <pre className="cmd">{REBUILD_CMD}</pre>
        <p>Rebuilds <code>datasets/processed/</code> from <code>datasets/raw/</code>. The script refuses to run if any airport lacks a runway length rather than guessing one. Re-downloading the raw files is described in <code>datasets/raw/PROVENANCE.json</code> (URLs and expected hashes).</p>
      </section>
    </article>
  )
}
