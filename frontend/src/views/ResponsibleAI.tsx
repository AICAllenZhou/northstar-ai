import { useStore } from '../state/store'

const REAL: [string, string][] = [
  ['Airport identities, ICAO/IATA codes, coordinates, elevation (28 airports)', 'OurAirports, public domain'],
  ['Runway length and surface for 26 of 28 airports', 'OurAirports, public domain'],
  ['Runway length/surface for Grise Fiord and Kimmirut; surface for Whale Cove and Chesterfield Inlet', 'Secondary source: Wikipedia infoboxes citing the Canada Flight Supplement — flagged per airport'],
  ['2021 Census population for 25 Nunavut communities plus Yellowknife, Winnipeg and Ottawa', 'Statistics Canada, Open Licence'],
  ['Basemap: countries, provinces/territories, lakes', 'Natural Earth 1:50m, public domain'],
]
const SYNTHETIC: [string, string][] = [
  ['Hub roles (medical / cargo / passenger)', 'Informed by public knowledge of regional hospitals and airline hubs; not an official designation'],
  ['Route network (41 undirected routes)', 'Hub-and-spoke simplification; not an official schedule or airway structure'],
  ['Fleet of 10 aircraft: composition, bases, availability, cost index', 'Real aircraft types with rounded public specs; composition and basing invented'],
  ['Daily passenger schedule (26 legs) and passenger counts', 'Invented one-day schedule so the network has a normal state to disrupt'],
  ['Base weather and wildfire risk values', 'Constant placeholders consumed by the transparent risk score'],
  ['Medical emergencies, cargo requests, closures, weather and wildfire events', 'Presets or the seeded scenario generator'],
  ['Community priority weights', 'Equal (1.0) by default; see Equity'],
  ['Response target 240 min, turnaround 30 min, cargo deadline 8 h', 'Simulation parameters declared in config.py'],
]
const PROVENANCE: { what: string; source: string; licence: string; flag?: string }[] = [
  { what: 'Airport identity, coordinates, runways', source: 'OurAirports airports.csv / runways.csv (retrieved 2026-09-24)', licence: 'Public domain (Unlicense)' },
  { what: '2021 Census population, census subdivisions', source: 'Statistics Canada table 98-10-0002-01', licence: 'Statistics Canada Open Licence' },
  { what: 'Country, province/territory and lake polygons', source: 'Natural Earth 1:50m vectors', licence: 'Public domain' },
  { what: 'Two runway lengths (CYGZ, CYLC) and two surfaces (CYXN, CYCS)', source: 'Wikipedia airport infoboxes, which cite the Canada Flight Supplement (Nav Canada)', licence: 'CC BY-SA (text); flagged in airports.csv data_flags', flag: 'secondary source' },
]

export function ResponsibleAI() {
  const disclaimer = useStore((s) => s.network?.disclaimer) ?? 'NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for real-world flight operations, medical decisions, or aviation dispatch.'
  return (
    <div className="rai">
      <section className="rai-hero">
        <div className="eyebrow">Responsible AI statement</div>
        <blockquote>{disclaimer}</blockquote>
        <p>NORTHSTAR is a student research project that asks whether constraint-based optimization can improve the resilience of a remote aviation network during disruptions, measured against a simple rule-based dispatch policy, inside a simulation. It recommends aircraft-to-mission assignments in that simulation. It does not communicate with any aircraft, airline, hospital, dispatcher or air-traffic system, and nothing it produces should be used to make a real-world decision.</p>
      </section>

      <section className="rai-grid">
        <Card title="Human in the loop" tone="ns">
          <ul>
            <li>NORTHSTAR produces a <b>recommended plan</b>. The operator runs it explicitly and can inspect every assignment, the alternatives that were rejected and the trade-offs. Nothing is applied automatically.</li>
            <li>Every recommendation carries structured reasons computed from the data the optimizer saw (feasibility table, chosen values, executed results). No language model writes or embellishes them.</li>
            <li>The policy weights that define “better” are visible and switchable. There is no hidden objective, and the project does not claim any one profile is correct.</li>
          </ul>
        </Card>
        <Card title="Uncertainty and limitations" tone="warn">
          <ul>
            <li>The simulation is deterministic; real operations are not. A plan optimal under certainty may be brittle under uncertainty.</li>
            <li>Simplifications: no crew duty limits, no fuel planning beyond range, no forecasts, no airport capacity, no night or icing restrictions, no maintenance, 30-minute steps, great-circle distances, fixed turnaround.</li>
            <li>28 airports and 10 aircraft. Nothing shows the results hold for a larger network, another region, or a real airline.</li>
            <li>The baseline is one reasonable rule set, not an experienced dispatcher. The measured gap is a gap to that rule set.</li>
            <li>The optimizer optimizes the quantities the metrics measure; the policy-sensitivity runs and per-metric win/loss counts make that visible.</li>
            <li>Unserved missions are censored at the horizon end in every average, for both strategies, and the count is shown next to each average.</li>
          </ul>
        </Card>
        <Card title="Trade-offs are real and reported">
          <p>Optimizing for one goal costs another. In the primary demo scenario NORTHSTAR restores air service to more communities and cancels fewer flights than the baseline, and delivers one essential cargo load later than the baseline did. The experiment summary lists every metric on which the baseline won more scenarios. Negative results are not removed.</p>
        </Card>
        <Card title="Equity">
          <ul>
            <li>Communities are weighted equally by default. Weighting by population would systematically deprioritize the smallest, most isolated communities, often the ones most dependent on air links. The weight column exists so this choice can be discussed and changed deliberately, not silently.</li>
            <li>Medical missions are ordered by clinical priority (1–3), an input to the simulation, not something the system infers about a person.</li>
            <li>No personal data of any kind is used or generated.</li>
          </ul>
        </Card>
        <Card title="No autonomous real-world control">
          <p>The software has no interface to any real system and none is planned. The simulator, the optimizer and this interface run on one machine, offline: local basemap, local API, committed results, system fonts, no external calls.</p>
        </Card>
        <Card title="Explicit failure states" tone="danger">
          <p>When no feasible plan exists (every airport closed, no aircraft able to reach a community) the system says <b>NO FEASIBLE SOLUTION</b> and lists the reason per mission. When the solver reaches its time limit without proving optimality, the result is labelled as such. When the backend is unreachable or a dataset is missing, the interface says so and disables controls. The system never invents an answer to fill a gap.</p>
        </Card>
        <Card title="Before any operational use" wide>
          <p>Validated operational data, weather and forecast integration, uncertainty-aware planning, crew and maintenance constraints, regulatory review, and evaluation with the dispatchers, medical staff and communities who would be affected. None of this is part of the project.</p>
        </Card>
      </section>

      <section className="rai-section">
        <h3>Real versus synthetic data</h3>
        <p className="muted">Every number shown in the application is either traceable to a named public source or labelled synthetic. Synthetic operational data is never presented as real Canadian aviation data.</p>
        <div className="two-tables">
          <table className="rs-table">
            <thead><tr><th colSpan={2} className="th-real">Real, public sources with recorded provenance</th></tr></thead>
            <tbody>{REAL.map(([a, b]) => <tr key={a}><td>{a}</td><td className="muted">{b}</td></tr>)}</tbody>
          </table>
          <table className="rs-table">
            <thead><tr><th colSpan={2} className="th-syn">Synthetic, declared as such</th></tr></thead>
            <tbody>{SYNTHETIC.map(([a, b]) => <tr key={a}><td>{a}</td><td className="muted">{b}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rai-section">
        <h3>Data provenance</h3>
        <table className="rs-table">
          <thead><tr><th>What</th><th>Source</th><th>Licence</th></tr></thead>
          <tbody>
            {PROVENANCE.map((p) => (
              <tr key={p.what}><td>{p.what}{p.flag && <span className="chip warn flag">{p.flag}</span>}</td><td>{p.source}</td><td className="muted">{p.licence}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Machine-readable record with URLs, retrieval times and SHA-256 hashes: <code>datasets/raw/PROVENANCE.json</code>; per-file sidecars in <code>datasets/processed/*.meta.json</code>. Sources use legacy names for three communities; the application shows the current official names (Kinngait, Sanirajak, Naujaat). Community coordinates are the airport coordinates, adequate at network scale.</p>
      </section>
    </div>
  )
}

function Card({ title, children, tone = '', wide = false }: { title: string; children: React.ReactNode; tone?: string; wide?: boolean }) {
  return (
    <article className={`rai-card ${tone} ${wide ? 'wide' : ''}`}>
      <h3>{title}</h3>
      {children}
    </article>
  )
}
