# NORTHSTAR AI

**AI-powered air connectivity and resilience system for Northern Canada.**
A student research prototype built for WAICY: a simulation that asks whether
constraint optimization can keep remote fly-in communities connected during
wildfires, blizzards and aircraft failures better than rule-based dispatch.

> NORTHSTAR AI is a research simulation and decision-support prototype. It is not
> approved for real-world flight operations, medical decisions, or aviation dispatch.

## The problem and the research question

Nunavut's 25 communities have no roads between them. Medical evacuations,
essential cargo and passenger travel all depend on a small fleet flying between
gravel airstrips through hub airports. When a hub closes for wildfire smoke or a
blizzard, communities are cut off and emergency response slows down.

> **Can AI-assisted optimization improve the resilience of remote and Northern
> aviation networks during major disruptions?**

NORTHSTAR AI answers this inside a simulation by comparing two dispatch
strategies on identical disruption scenarios:

- **Baseline** — a transparent rule-based dispatcher: scheduled flights keep their
  aircraft, emergencies get the nearest free compatible aircraft on the shortest
  open route, retry when an aircraft frees up. Not tuned.
- **NORTHSTAR** — a constraint-programming optimizer (Google OR-Tools CP-SAT)
  that re-plans aircraft-to-mission assignment, ordering and routing every time
  the situation changes, under range, runway, capacity, closure and
  availability constraints, with an explicit, switchable weighted objective.

Both are executed by the same simulator and scored by the same metrics
function. Every NORTHSTAR decision is explained from the optimizer's own data;
no language model is involved anywhere. A 100-scenario paired experiment with a
fixed seed reports where NORTHSTAR is better, where it is worse, and by how much.

## What you get

- **A website** (`#/`): the human problem, the research question, how the method
  works, a live network illustration drawn from the real airports, the evidence
  with its trade-off, data transparency, Responsible AI, and the launch button.
- **The command center** (`#/simulation`): an offline MapLibre map of the real
  network, five disruption presets, a rule-based baseline and NORTHSTAR, a
  before/after result with the trade-off stated in words, and a per-decision
  explanation built from the optimizer's feasibility table. **Simple mode** is
  the default; the **Advanced** switch reveals objective weights, the ten-metric
  table, solver diagnostics, the replan log and playback controls.
- **The guided demo**: ten steps that build the primary scenario one disruption at
  a time (normal day → wildfire → hub closed and aircraft down → medical
  emergency → essential cargo → the damage → rule-based baseline → RUN NORTHSTAR
  AI → result → why, and the evidence). On wide screens the demo card docks in
  the right column so the map is never covered.
- **Research** (`#/research`): the study told in order — question, method,
  three headline numbers with their losses attached, one paired-difference
  strip per metric with all 100 scenarios, where NORTHSTAR loses (with the
  individual scenarios and an *Open in simulator* button), censoring, policy
  sensitivity, solver accounting that sums to the total, a sortable scenario
  explorer, and the exact reproduce command.
- **Data** and **About** pages: provenance per dataset with REAL / DERIVED /
  SYNTHETIC badges, what was deliberately not done, limitations, what it would
  take to use this for real, and a glossary for the numbers.

Truth rules the software keeps: every number on screen comes from the local
API; results are never hard-coded; synthetic operational data is labelled on
every page; when a run is served from the start-up cache the screen says so and
names when the engine computed it; the result button is enabled the instant a
result arrives, never after an animation.

## Architecture

```
datasets/processed (real geography + labelled synthetic operations)
      → Network model (NetworkX)  → Disruption engine → deterministic 30-min simulator
      → Baseline | NORTHSTAR (CP-SAT) | Do-nothing   (event-driven replanning)
      → shared metrics engine + explainability
      → FastAPI (one local process; result cache + start-up warm-up of the presets)
      → React + TypeScript + MapLibre website and command center (static, offline)
      → experiments/run_experiments.py → results.csv + summary
```

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Design decisions and
the specification audit: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
The overnight productization sprint (five reviewed iterations with tests,
screenshots and commit hashes): [`docs/OVERNIGHT_ITERATION_LOG.md`](docs/OVERNIGHT_ITERATION_LOG.md).

## Run it locally

Requirements: Python 3.12 via [`uv`](https://docs.astral.sh/uv/), Node 20+.
Everything runs offline after the first dependency install.

```bash
# competition demo: one process serving the built site at http://localhost:8000/
scripts/demo.sh                 # waits for warm-up and prints "ready in N s: 5 presets precomputed"
PORT=8010 scripts/demo.sh       # another port; REBUILD=1 forces a frontend rebuild; SMOKE=1 runs the smoke test

# development: backend on :8000 with reload, Vite dev server on :5173
scripts/dev.sh

# tests and quality gates
cd backend && uv run pytest                          # 42 tests
cd frontend && npm run build && npm run lint         # tsc + vite, oxlint

# browser check: every page, the ten demo steps, failure states, no external requests
cd frontend && BASE_URL=http://localhost:8000 node scripts/demo_screenshots.mjs   # writes docs/screenshots/
```

Exact live-demo path and narration: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
Pre-flight checklist: [`docs/WAICY_READINESS_CHECKLIST.md`](docs/WAICY_READINESS_CHECKLIST.md).

## Run the experiment

```bash
cd backend
uv run python ../experiments/run_experiments.py --n 100 --seed 42          # ~1–3 min on a laptop (multiprocess)
uv run python ../experiments/run_experiments.py --verify                   # re-run and compare trace hashes with the committed CSV
```

Outputs in `experiments/results/`: `results.csv` (one row per scenario ×
strategy × policy with every metric, the solver buckets and a trace hash),
`scenarios.jsonl`, `summary.json` (consumed by the Research page) and
`summary.md`. The summary records the commit hash it was produced at and
whether the tree was dirty. Methodology, metric definitions and statistics:
[`docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`](docs/DATA_AND_EXPERIMENT_METHODOLOGY.md).

Headline of the committed run (seed 42, policy `balanced`, 100 paired
scenarios): disconnected-community hours 64.6 → 41.9 (NORTHSTAR better in 88,
baseline better in 2, tie in 10); mean passenger delay 3h18 → 1h21 (96 / 0 / 4);
cancelled flights 2.2 → 0.2 per scenario (71 / 2 / 27); medical response
155 → 129 min (24 / 7 / 69). Trade-off: NORTHSTAR reassigns aircraft about
three times as often (baseline better in 65). Read the live numbers on the
Research page, not from this paragraph.

## What is real and what is synthetic

| Real (public sources, provenance recorded) | Synthetic (declared assumptions) |
|---|---|
| 28 airports: identity, coordinates, runway length and surface (OurAirports, public domain; two runway lengths from a secondary source, flagged) | Fleet of 10 aircraft (real types, approximate specs, invented composition and bases) |
| 2021 Census population of every community (Statistics Canada Open Licence) | Route list, daily schedule, passenger and cargo demand |
| Basemap polygons (Natural Earth, public domain), also drawn behind the website's network illustration | Hub roles, medical emergencies, closures, weather and wildfire events, operating-cost index |

Full record: [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) and the Data
page. Synthetic operational data is never presented as real Canadian aviation data.

## Limitations

Deterministic simulation; no crew, fuel-planning, forecast, airport-capacity or
night constraints; one 28-airport network; the baseline is a rule set, not an
expert dispatcher; the optimizer optimizes the same quantities the metrics
measure (made visible through per-metric win/loss counts and policy
sensitivity runs); results do not generalise to real operations. Full
statement: [`docs/RESPONSIBLE_AI.md`](docs/RESPONSIBLE_AI.md) and the About page.

## Repository layout

```
backend/northstar/   simulation, strategies, optimizer, metrics, explainability, API   backend/tests/
frontend/            React + TypeScript + MapLibre website and command center; scripts/demo_screenshots.mjs
datasets/raw/        downloaded public data + PROVENANCE.json      datasets/processed/  model inputs + metadata
experiments/         run_experiments.py, results/
scripts/             demo.sh, dev.sh, wait_ready.py, smoke_test.py, build_datasets.py
docs/                plan, architecture, methodology, provenance, responsible AI, demo script, readiness checklist,
                     overnight iteration log, final product review, screenshots/
```

## Licence and attribution

Code: MIT. Data: OurAirports (public domain), Statistics Canada (Open
Licence), Natural Earth (public domain); see `docs/DATA_PROVENANCE.md`.
Fonts: IBM Plex (Open Font Licence), bundled.
