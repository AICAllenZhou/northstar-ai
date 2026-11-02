import { REAL_DATA, SYNTHETIC_DATA } from './copy'

/** Real vs synthetic, visually separated: ice-blue rule for real, amber rule + chip for synthetic. */
export function DataColumns({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className="data-cols">
      <div className="data-col real">
        <p className="col-label">Real public data</p>
        <ul>
          {REAL_DATA.map((d) => <li key={d.what}>{d.what} <span>({d.source})</span></li>)}
        </ul>
        {expanded && (
          <p className="col-note">Every real value is traceable to a named download: URL, licence, retrieval time and SHA-256 hash are recorded in <code>datasets/raw/PROVENANCE.json</code>. Sources use legacy names for three communities; the application shows the current official names (Kinngait, Sanirajak, Naujaat). Community coordinates are the airport coordinates, adequate at network scale.</p>
        )}
      </div>
      <div className="data-col syn">
        <p className="col-label">Synthetic operational data <span className="chip syn">Synthetic</span></p>
        <ul>
          {SYNTHETIC_DATA.map((d) => <li key={d.what}>{d.what}{d.source && <span> ({d.source})</span>}</li>)}
        </ul>
        {expanded && (
          <p className="col-note">The route list is a hub-and-spoke simplification informed by publicly advertised Northern airline networks, not an official schedule or airway structure. Hub roles are a project assumption informed by public knowledge of regional hospitals and airline hubs. Response target (240 min), turnaround (30 min) and the default cargo deadline (8 h) are simulation parameters declared in <code>config.py</code>.</p>
        )}
      </div>
    </div>
  )
}
