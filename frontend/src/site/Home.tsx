import { HREF } from '../router'
import { useStore } from '../state/store'
import { FALLBACK_DISCLAIMER } from './copy'
import { DataColumns } from './DataColumns'
import { Evidence } from './Evidence'
import { NetworkLoop } from './NetworkLoop'
import { useRevealOnScroll } from './reveal'
import { Section } from './Section'

const TILES = [
  { t: 'Healthcare', p: 'Medical evacuations fly patients hundreds of kilometres to the nearest hospital.' },
  { t: 'Food and fuel', p: 'Essential cargo arrives by air between the annual sealift.' },
  { t: 'Everyday life', p: 'School trips, family visits, work, mail.' },
  { t: 'Emergency response', p: 'Search and rescue, fire, evacuation.' },
]

const CHAIN = [
  { cls: 'chain-wildfire', t: 'Wildfire smoke closes a hub airport' },
  { cls: 'chain-weather', t: 'Severe weather blocks routes' },
  { cls: 'chain-aircraft', t: 'An aircraft goes unserviceable' },
  { cls: 'chain-medical', t: 'A medical emergency is called' },
]

const DEFS = [
  { t: 'Resilience', d: 'how much air service communities keep, and how fast it comes back' },
  { t: 'Optimization', d: 'choosing which aircraft flies which mission, in what order, on which route' },
  { t: 'Compared against', d: 'a transparent rule-based dispatcher, on identical scenarios' },
]

const PIPELINE = [
  { t: 'Northern aviation network', p: '28 real airports, 25 communities, 41 routes; a synthetic fleet of 10 aircraft and a daily schedule.' },
  { t: 'Disruption', p: 'Wildfire, weather, closures, aircraft failures, medical and cargo requests, alone or together.' },
  { t: 'Simulation', p: 'A deterministic day in 30-minute steps; the same for every strategy.' },
  { t: 'Baseline response', p: 'Nearest free aircraft, shortest open route, retry when one frees up.' },
  { t: 'NORTHSTAR optimization', p: 'Every time something changes, solve for the assignment that best balances medical response, community connectivity, cargo, passengers and cost.', ns: true },
  { t: 'Aircraft and route reallocation', p: 'Aircraft are pre-positioned, missions re-ordered, alternate hubs used.' },
  { t: 'Measured outcomes', p: 'Ten metrics, the same function for every strategy; unserved missions are counted, not dropped.' },
]

export function Home() {
  const disclaimer = useStore((s) => s.network?.disclaimer) ?? FALLBACK_DISCLAIMER
  useRevealOnScroll()
  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow-brief">Student research project · WAICY</p>
            <h1 id="hero-h">NORTHSTAR AI</h1>
            <p className="hero-sub">AI-powered air connectivity and resilience system for Northern Canada</p>
            <p className="hero-body">A simulation of how constraint-based optimization can help remote communities stay connected during wildfires, severe weather and aviation disruptions.</p>
            <div className="cta-row">
              <a className="btn accent big" href={HREF.simulation}>Launch NORTHSTAR</a>
              <a className="btn ghost big" href={HREF.research}>View the research</a>
            </div>
            <p className="hero-note">{disclaimer}</p>
          </div>
          <div className="hero-loop">
            <NetworkLoop />
          </div>
        </div>
      </section>

      <Section id="situation" eyebrow="Situation" title="The human problem" lead="In Nunavut, no community is connected to another by road. Aviation is not transportation; it is the supply line.">
        <ul className="tiles4">
          {TILES.map((t) => <li key={t.t}><h3>{t.t}</h3><p>{t.p}</p></li>)}
        </ul>
        <div className="beat">
          <h3 className="beat-q">What happens when several things go wrong at once?</h3>
          <div>
            <ol className="chain" aria-label="A compounding day">
              {CHAIN.map((c) => <li key={c.cls} className={c.cls}>{c.t}</li>)}
            </ol>
            <p className="beat-close">The aircraft that are left have to be reassigned, fast, without leaving anyone behind.</p>
          </div>
        </div>
      </Section>

      <section id="question" className="sec reveal" aria-labelledby="question-h">
        <div className="wrap">
          <p className="eyebrow-brief">The question</p>
          <h2 id="question-h" className="rq">Can AI-assisted optimization improve the resilience of remote and Northern aviation networks during major disruptions?</h2>
          <dl className="defs">
            {DEFS.map((d) => <div key={d.t}><dt>{d.t}</dt><dd>{d.d}</dd></div>)}
          </dl>
        </div>
      </section>

      <Section id="method" eyebrow="Method" title="How NORTHSTAR works">
        <ol className="pipeline" aria-label="Pipeline">
          {PIPELINE.map((s) => <li key={s.t} className={s.ns ? 'ns' : ''}><h3>{s.t}</h3><p>{s.p}</p></li>)}
        </ol>
      </Section>

      <Section id="preview" eyebrow="Preview" title="Interactive teaser" lead="A guided walkthrough takes about four minutes. Nothing is pre-recorded: every number is computed live by the simulator.">
        <div className="preview-grid">
          <figure className="shot">
            <img src="/preview/command-center.png" width={1600} height={1000} alt="The NORTHSTAR command center during the guided demo: a map of Nunavut with open and closed routes, the disruption list, a do-nothing / baseline / NORTHSTAR comparison table and the explained decisions." />
          </figure>
          <div className="preview-side">
            <div className="cta-col">
              <a className="btn accent big" href={`${HREF.simulation}?demo=1`}>Enter the simulation →</a>
              <a className="more quiet" href={HREF.simulation}>Explore on your own</a>
            </div>
          </div>
        </div>
      </Section>

      <Evidence />

      <Section id="data" eyebrow="Data" title="Data transparency">
        <DataColumns />
        <p className="rule-line">Synthetic operational data is never presented as real Canadian aviation data.</p>
        <p className="more-row"><a className="more" href={HREF.data}>Data and provenance →</a></p>
      </Section>

      <Section id="limits" eyebrow="Limits" title="Responsible AI" lead="NORTHSTAR supports human decision-making.">
        <div className="limits-grid">
          <div className="notlist">
            <p className="mono-label">It does not</p>
            <ul>
              <li>control aircraft</li>
              <li>make medical decisions</li>
              <li>replace dispatchers</li>
              <li>claim any real-world aviation certification</li>
            </ul>
          </div>
          <div>
            <p className="body-lg">Every recommendation comes with its reasons, the alternatives it rejected, and the trade-offs it accepted.</p>
            <p className="more-row"><a className="more" href={`${HREF.about}#responsible-ai`}>Read the Responsible AI statement →</a></p>
          </div>
        </div>
      </Section>

      <section className="launch reveal" aria-labelledby="launch-h">
        <div className="wrap">
          <p className="eyebrow-brief">Launch</p>
          <h2 id="launch-h">Enter the NORTHSTAR command center</h2>
          <div className="cta-row">
            <a className="btn accent big" href={HREF.simulation}>Launch NORTHSTAR</a>
            <a className="btn ghost big" href={`${HREF.simulation}?demo=1`}>Start the guided demo</a>
          </div>
        </div>
      </section>
    </div>
  )
}
