import { ResponsibleAI } from '../views/ResponsibleAI'
import { BEFORE_REAL_USE, GLOSSARY, LIMITATIONS } from './copy'

const STEPS = [
  { t: 'Model the network', p: 'Airports, communities and routes become a graph. Each aircraft carries its range, runway and capacity limits, so the model knows which legs are possible for which aircraft.' },
  { t: 'Simulate disruptions', p: 'Wildfire, weather, closures, aircraft failures and new medical or cargo requests are applied to that graph over a 24-hour day in 30-minute steps.' },
  { t: 'Evaluate feasible aircraft and routes', p: 'At every change, the simulator lists which aircraft could serve which mission over which open path, and why the others cannot.' },
  { t: 'Compare possible assignments', p: 'Each feasible option is costed: response time, community time without service, cargo lateness, passenger delay, distance flown, changes to earlier plans.' },
  { t: 'Optimize competing objectives', p: 'A constraint solver picks the set of assignments that minimises the weighted total under every limit at once. The weights are visible and switchable.' },
  { t: 'Measure the effect', p: 'One metric function scores the do-nothing, baseline and NORTHSTAR runs, and the reasons behind each decision are recorded from the solver’s own data.' },
]

const STACK = ['Python', 'NetworkX', 'OR-Tools CP-SAT', 'FastAPI', 'React', 'MapLibre']

export function AboutPage() {
  return (
    <article className="page about">
      <header className="page-head wrap">
        <p className="eyebrow-brief">About</p>
        <h1>About the technology</h1>
        <p className="lead">NORTHSTAR is a simulation with two dispatch strategies inside it. Conceptually, it does six things.</p>
      </header>

      <section className="wrap" aria-labelledby="how-h">
        <h2 id="how-h" className="sr-only">How it works, in six steps</h2>
        <ol className="steps">
          {STEPS.map((s) => <li key={s.t}><h3>{s.t}</h3><p>{s.p}</p></li>)}
        </ol>
      </section>

      <section className="wrap stack" aria-labelledby="stack-h">
        <p className="mono-label" id="stack-h">Stack</p>
        <ul className="stack-row">{STACK.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>

      <section id="limitations" className="wrap" aria-labelledby="lim-h">
        <p className="eyebrow-brief">Limitations</p>
        <h2 id="lim-h">What the simulation leaves out</h2>
        <p>Stated before the experiment was run, in the methodology document (§3.6 and §9). Read every result on the Research page with these in mind.</p>
        <ul className="plainlist">
          {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>

      <section id="real-use" className="wrap" aria-labelledby="real-h">
        <p className="eyebrow-brief">Distance to reality</p>
        <h2 id="real-h">What it would take to use this for real</h2>
        <p>From the Responsible AI statement (§9). None of this is part of the project.</p>
        <ol className="plainlist numbered">
          {BEFORE_REAL_USE.map((l) => <li key={l}>{l}</li>)}
        </ol>
      </section>

      <section id="glossary" className="wrap" aria-labelledby="gl-h">
        <p className="eyebrow-brief">How to read the numbers</p>
        <h2 id="gl-h">A short glossary for the Research page</h2>
        <dl className="glossary">
          {GLOSSARY.map((g) => <div key={g.t}><dt>{g.t}</dt><dd>{g.d}</dd></div>)}
        </dl>
      </section>

      <section id="responsible-ai" className="wrap" aria-labelledby="rai-h">
        <p className="eyebrow-brief">Limits</p>
        <h2 id="rai-h">Responsible AI</h2>
        <ResponsibleAI />
      </section>

      <section className="wrap credits" aria-labelledby="credits-h">
        <p className="eyebrow-brief">Credits</p>
        <h2 id="credits-h">A student research project for WAICY</h2>
        <p>Built for the World Artificial Intelligence Competition for Youth. The code is MIT-licensed. The open data comes from OurAirports (public domain), Statistics Canada (Open Licence) and Natural Earth (public domain); everything operational is synthetic and labelled as such.</p>
      </section>
    </article>
  )
}
