# NORTHSTAR AI

**AI-powered aviation resilience simulation for remote and Northern Canadian communities.**
A student research prototype built for WAICY.

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

- **Baseline** — a transparent rule-based dispatcher (highest priority first,
  nearest free compatible aircraft, shortest open route, retry when an aircraft
  frees up). Not tuned.
- **NORTHSTAR** — a constraint-programming optimizer (Google OR-Tools CP-SAT)
  that re-plans aircraft-to-mission assignment, ordering and routing every time
  the situation changes, under range, runway, capacity, closure and
  availability constraints, with an explicit, switchable weighted objective.

Both are executed by the same simulator and scored by the same metrics
function. Every NORTHSTAR decision is explained from the optimizer's own data.
A 100-scenario paired experiment with a fixed seed reports where NORTHSTAR is
better, where it is worse, and by how much.

## Architecture

```
datasets/processed (real geography + labelled synthetic operations)
      → Network model (NetworkX)  → Disruption engine → deterministic 30-min simulator
      → Baseline | NORTHSTAR (CP-SAT) | Do-nothing   (event-driven replanning)
      → shared metrics engine + explainability
      → FastAPI (one local process)  → React + TypeScript + MapLibre command centre
      → experiments/run_experiments.py → results.csv + summary
```

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Design decisions and
the specification audit: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Run it locally

Requirements: Python 3.12 via [`uv`](https://docs.astral.sh/uv/), Node 20+.
Everything runs offline after the first dependency install.

```bash
# competition demo: one process serving the built frontend at http://localhost:8000/
scripts/demo.sh

# development: backend on :8000 with reload, Vite dev server on :5173
scripts/dev.sh
# (the backend serves frontend/dist only if it exists when it starts; after `npm run build`, restart it)

# tests (backend) and quality gates (frontend)
cd backend && uv run pytest
cd frontend && npm run build && npm run lint

# drive the ten-step demo sequence against a running backend
uv run --project backend python scripts/smoke_test.py
```

## Run the experiment

```bash
cd backend
uv run python ../experiments/run_experiments.py --n 100 --seed 42          # ~2–10 min depending on CPU cores
uv run python ../experiments/run_experiments.py --verify                   # re-run and compare trace hashes with the committed CSV
```

Outputs in `experiments/results/`: `results.csv` (one row per scenario ×
strategy × policy with every metric, solver status and a trace hash),
`scenarios.jsonl`, `summary.json` (consumed by the Research screen) and
`summary.md`. Methodology, metric definitions and statistics:
[`docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`](docs/DATA_AND_EXPERIMENT_METHODOLOGY.md).

## Demo mode

The header's **Demo Mode** button opens a guided ten-step walkthrough (healthy
network → disruption → impact → baseline → RUN NORTHSTAR AI → animation →
before/after → explain a decision → research results → Responsible AI) with
backup presets. Narration and timings: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
Pre-flight checklist: [`docs/WAICY_READINESS_CHECKLIST.md`](docs/WAICY_READINESS_CHECKLIST.md).

## What is real and what is synthetic

| Real (public sources, provenance recorded) | Synthetic (declared assumptions) |
|---|---|
| 28 airports: identity, coordinates, runway length and surface (OurAirports, public domain; two runway lengths from a secondary source, flagged) | Fleet of 10 aircraft (real types, approximate specs, invented composition and bases) |
| 2021 Census population of every community (Statistics Canada Open Licence) | Route list, daily schedule, passenger and cargo demand |
| Basemap polygons (Natural Earth, public domain) | Hub roles, medical emergencies, closures, weather and wildfire events, operating-cost index |

Full record: [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md). Synthetic
operational data is never presented as real Canadian aviation data.

## Limitations

Deterministic simulation; no crew, fuel-planning, forecast, airport-capacity or
night constraints; one 28-airport network; the baseline is a rule set, not an
expert dispatcher; the optimizer optimizes the same quantities the metrics
measure (made visible through per-metric win/loss counts and policy
sensitivity runs); results do not generalise to real operations. Full
statement: [`docs/RESPONSIBLE_AI.md`](docs/RESPONSIBLE_AI.md).

## Repository layout

```
backend/northstar/   simulation, strategies, optimizer, metrics, explainability, API   backend/tests/
frontend/            React + TypeScript + MapLibre command centre
datasets/raw/        downloaded public data + PROVENANCE.json      datasets/processed/  model inputs + metadata
experiments/         run_experiments.py, results/
scripts/             dev.sh, demo.sh, smoke_test.py, build_datasets.py
docs/                plan, architecture, methodology, provenance, responsible AI, demo script, readiness checklist
```

## Licence and attribution

Code: MIT. Data: OurAirports (public domain), Statistics Canada (Open
Licence), Natural Earth (public domain); see `docs/DATA_PROVENANCE.md`.
