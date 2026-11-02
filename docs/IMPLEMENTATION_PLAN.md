# NORTHSTAR AI — Implementation Plan

**Status (2026-09-24):** Milestones 0–8 complete and committed; see §9 for the status log and the changes made during implementation. This document is the working
plan for taking the PRD and Technical Design to a competition-ready prototype.
**Date:** 2026-09-23
**Inputs audited:** `docs/NORTHSTAR_AI_PRD.md`, `docs/NORTHSTAR_AI_Technical_Design.md`

---

## 1. State of the repository before this plan

There was no code. The workspace contained only the two specification documents.
Everything described below is greenfield. The repository was created at
`northstar-ai/` with the layout recommended in the Technical Design (§3), with
two deliberate deviations recorded in §4 of this document.

Toolchain verified on the development machine: Python 3.12 via `uv`, Node 25 /
npm 11, network access to PyPI, npm, GitHub and public datasets.

---

## 2. Specification audit

Each finding lists where it comes from, why it matters for WAICY, and the
decision taken. Decisions marked **(D)** are design choices a reader may want
to overrule; all are recorded so that the reasoning is visible.

### 2.1 Contradictions between the PRD and the Technical Design

| # | Finding | Decision |
|---|---------|----------|
| C1 | PRD F8 marks Research/Experiment Mode "Must Have", but PRD §13 places batch experiments in P1 and the Tech Design puts it in Sprint 5. | Experiment mode is required for Definition of Done (PRD §12). Built in P1, but the project is not "done" without it. |
| C2 | PRD F2 (Must Have) requires ≥3 simultaneous disruptions; PRD §13 lists "multiple simultaneous disruptions" as P1 item 10. | Simultaneous disruptions are P0. The primary demo preset needs four at once. |
| C3 | Tech Design §7 prose says an unassignable mission is *queued*; the pseudo-code sets `status = "unserved"` and never retries. | Baseline **queues and retries** whenever an aircraft becomes free or the network changes. A baseline that never retries would be a strawman and would invalidate the comparison. Follow-up (2026-09-24): the first implementation also reassigned scheduled flights to any free aircraft on release and scored worse than the published schedule on passenger metrics, another strawman signature; scheduled flights now keep their own aircraft unless it is failed or stranded. |
| C4 | Tech Design §5 example mission targets `HOSPITAL_01`, but no hospital / medical hub / cargo hub exists in the data model, while PRD §3 says the map shows medical and cargo hubs. | Airport model gains `is_medical_hub`, `is_cargo_hub`, `is_passenger_hub`. Medical missions route to the nearest reachable medical hub. |
| C5 | Tech Design §4 `Disruption.target_id` is a single id, but wildfire and severe weather affect areas (several airports and routes). | `Disruption` carries `target_ids: list[str]` plus optional `center`/`radius_km` for area effects. |
| C6 | Tech Design §6 says "airports / communities as nodes", but communities are linked to airports by `nearest_airport_id`, so communities are not flight-graph nodes. | Graph nodes are airports only. A community's connectivity is derived from its airport. |
| C7 | PRD §7 metrics (cancelled flights, cargo completion rate, % medical within target) are missing from the Tech Design §11 metrics JSON, which in turn lacks utilization and % critical missions completed. | One metrics schema = union of PRD §7, Tech Design §11 and the ten metrics in the brief. See `DATA_AND_EXPERIMENT_METHODOLOGY.md` §4. |
| C8 | Tech Design §14 mixes a session-less `POST /scenario/reset` with id-addressed `GET /scenario/{id}/metrics`. | Single-session API: one active scenario per backend process, addressed without ids. Presets and experiments are addressed by id. Simpler and sufficient for a demo. |
| C9 | Tech Design §2 recommends Vercel/Render/PostgreSQL deployment; brief and Tech Design §13 require offline operation. | Local-only. No cloud deployment, no database. Everything runs on `localhost`. |
| C10 | Tech Design §9 risk formula uses visibility and wind inputs that exist nowhere in the data model. | Transparent risk score uses only fields that exist: endpoint `weather_risk`, `wildfire_risk`, and route length. Documented in `ARCHITECTURE.md` §6. |
| C11 | Tech Design §10 hard-codes "nearest compatible available aircraft" as a reason. The optimizer will often *not* pick the nearest aircraft; that is the point. | Reasons are computed from data. A non-nearest choice is explained as such ("2nd nearest; nearest was reserved for MED-01"). |

### 2.2 Missing product requirements

| # | Gap | Decision |
|---|-----|----------|
| P1 | **"Disconnected community" is never defined.** Under a purely structural definition (airport closed / no path) the metric is identical for both strategies and the comparison is meaningless. | Two-part definition: *structural* (airport closed, or no open path to a hub flyable by any fleet type) **plus** *service* (a scheduled inbound flight was disrupted and no replacement has landed yet). Both count toward disconnected-community hours. Only the service part is strategy-dependent, which is stated openly. **(D)** |
| P2 | No scenario clock, start time or horizon. "Recovery time" and "medical emergency at hour 6" are undefined without one. | Scenario = 24 h horizon, 30-minute steps (48 steps), clock starts 06:00. Configurable per scenario. |
| P3 | "Before intervention" impact is requested but not defined. | Three states are computed and shown: **Do nothing** (disrupted flights cancelled, no reassignment), **Baseline**, **NORTHSTAR**. |
| P4 | Human-in-the-loop is claimed but has no UI expression. | NORTHSTAR output is labelled a *recommended plan*; the operator applies it with an explicit button. Nothing is auto-applied. |
| P5 | Weights are "configurable" but there is no requirement to show this. | Three named policy profiles (Balanced, Medical-first, Connectivity-first) selectable in the UI, plus raw weight display. |
| P6 | Offline map: MapLibre needs a basemap; external tiles violate the offline requirement. | Bundle public-domain Natural Earth land/province/lake polygons as local GeoJSON and render them as vector fill layers. No tile server. Optional online raster layer behind a toggle. |
| P7 | No behaviour defined when the backend is unreachable, the optimizer times out, or a scenario is infeasible. | Explicit UI states for each; see §16 of the brief and `ARCHITECTURE.md` §10. |
| P8 | Research page needs data without running 100 scenarios live. | Experiment results are committed to `experiments/results/` and served by the API. A live re-run of a smaller batch is available as a background job. |
| P9 | Demo flow relies on the presenter clicking the right things in order. | Dedicated **Demo Mode**: a guided 10-step walkthrough with a single "Next" button. Backup presets included. |
| P10 | Projector readability. | Large type, high-contrast dark theme, no paragraphs on the main screen. |

### 2.3 Missing technical requirements

| # | Gap | Decision |
|---|-----|----------|
| T1 | Determinism is asserted but not specified. | Rules: seeded `numpy.random.default_rng`, all iteration in sorted id order, stable tie-breaks by id, CP-SAT with `num_workers=1` and fixed `random_seed`, solver status recorded per run. Reproducibility tests assert byte-identical results across two runs. |
| T2 | No replanning model. Emergencies occur at different times; a single plan at t=0 would require clairvoyance. | **Event-driven replanning** for both strategies: the simulator calls the strategy at t=0 and whenever a mission is released, a disruption starts/ends, or an aircraft fails or becomes free. Both strategies receive identical information at identical times. |
| T3 | Unit conventions absent. | km, minutes, kg, people. Time stored as minutes from scenario start, snapped to 30-minute steps. |
| T4 | Distances undefined. | Great-circle (haversine) from real coordinates. |
| T5 | Multi-hop routing undefined. | Shortest open path in the airport graph; every hop must respect the aircraft's range and every intermediate airport its runway. |
| T6 | Fleet–network compatibility not required. | Data validation test: every community must be reachable by at least one aircraft type in the fleet. |
| T7 | Optimizer objective units are mixed and unnormalised. | Integer CP-SAT objective in "cost points" with explicitly documented per-unit weights. |
| T8 | Solver time limit unspecified (demo risk). | 10 s hard limit; status returned (`OPTIMAL`, `FEASIBLE`, `NO_FEASIBLE_SOLUTION`, `TIMEOUT`). |
| T9 | No test framework named. | `pytest` for backend; TypeScript type-check and build for frontend; one end-to-end demo smoke test through the API. |
| T10 | SQLite named but nothing needs a database. | Dropped. Datasets are CSV/JSON; session state is in memory; results are CSV/JSON files. |

### 2.4 Unnecessary complexity removed

- SQLite / PostgreSQL, Vercel / Render deployment (C9, T10).
- Four separate frontend screens. Collapsed to one command-center screen with a comparison panel, plus two tabs (Research, Responsible AI).
- Per-step weather inputs (wind, visibility) with no data source.

### 2.5 Risk of becoming a generic route planner, and mitigations

| Risk | Mitigation |
|------|-----------|
| The map is the star and the AI is invisible. | Research question, hypothesis and "where the AI is" are on the landing panel. The RUN NORTHSTAR button is the visual focal point. |
| Judges do not recognise constraint optimisation as AI. | The comparison panel labels the method (constraint programming search with CP-SAT) and the explanation panel shows the alternatives the optimizer rejected and why. |
| Results look cherry-picked. | 100 paired scenarios, fixed seed, raw CSV committed, wins/losses/ties reported per metric, negative results shown. |
| Weights look arbitrary. | Policy profiles are exposed; the Research page shows how the outcome changes under a different profile. |

### 2.6 Missing methodology, provenance, reproducibility, demo reliability, responsible AI, testing

Each has a dedicated document:

- Evaluation & experiment methodology → `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`
- Data provenance rules and per-dataset metadata → `docs/DATA_PROVENANCE.md` (written when the datasets exist, in Milestone 1)
- Demo reliability and judging readiness → `docs/WAICY_READINESS_CHECKLIST.md`
- Responsible AI → `docs/RESPONSIBLE_AI.md` (Milestone 6)
- Testing requirements → §6 of this document

---

## 3. Final MVP definition

The MVP is the shortest path through the pipeline in the brief:

```
Public / prepared dataset  →  Network model (NetworkX)  →  Disruption engine
   →  Baseline strategy   |   NORTHSTAR optimizer (OR-Tools CP-SAT)
   →  Shared simulator + shared metrics + explanations
   →  FastAPI  →  React + TypeScript + MapLibre  →  Demo Mode
```

Scope boundaries:

- **Geography (D):** Nunavut's 25 fly-in communities plus three southern gateways
  (Yellowknife, Winnipeg, Ottawa). Nunavut is the strongest possible framing:
  every community is accessible only by air, so the research question is not
  hypothetical. This gives 28 airports and 25 communities, slightly above the
  PRD's "15–25 airports" but inside "20–30 communities".
- **Fleet:** 10 synthetic aircraft of five real types (Twin Otter, ATR 42,
  Dash 8, King Air 350 medevac, PC-12 medevac, 737-200 combi) with approximate
  public specifications, labelled synthetic.
- **Missions:** scheduled passenger service (synthetic daily schedule),
  medical evacuations and essential cargo requests generated by disruptions.
- **Disruptions:** airport closure, aircraft failure, medical emergency,
  essential cargo request, wildfire, severe weather. All six can coexist.
- **Not in MVP:** ML risk model, live weather, live wildfire feeds, scenario
  editor beyond the disruption form, any real-world integration.

---

## 4. Deviations from the Technical Design

1. Airports count is 28 rather than ≤25 (explained above).
2. No SQLite. No deployment targets.
3. Backend package is `backend/northstar/` (importable name) rather than
   `backend/app/`. Module names inside follow the Tech Design.
4. Replanning is event-driven rather than plan-once (T2).

---

## 5. Milestones and task breakdown

Each milestone ends with tests passing and a logical git commit. P-levels
follow Phase 18 of the brief.

### Milestone 0 — Planning (this document) ✔
- Audit, plan, readiness checklist, methodology, architecture spec.

### Milestone 1 — Data (P0)
- Fetch real public data with provenance: OurAirports airports and runways
  (public domain), Statistics Canada 2021 population (open licence), Natural
  Earth basemap geometry (public domain).
- Build processed datasets: `airports.csv`, `communities.csv`, `aircraft.csv`,
  `routes.csv`, `schedule.csv`, `hubs` fields, each with a `*.meta.json`
  sidecar (source, real/synthetic, version, assumptions, licence URL).
- Validation script: coordinates in range, every community reachable by some
  fleet type, every route endpoint exists.
- Write `docs/DATA_PROVENANCE.md`.

### Milestone 2 — Core model and simulation (P0)
- Pydantic models: Airport, Community, Aircraft, Route, Mission, Disruption,
  Scenario, SimulationState, Plan, Trace, Metrics, DecisionRecord.
- Data loader → `Network`.
- NetworkX graph; connectivity, viable paths, structural disconnection.
- Disruption engine: time-windowed effects on nodes, edges, aircraft; mission
  generation from medical/cargo disruptions.
- Deterministic 30-minute simulator executing a `Plan` with event-driven
  replanning hooks.
- Tests: closed airport unusable, failed aircraft unassignable, runway/range/
  capacity constraints, simultaneous disruptions, reset.

### Milestone 3 — Baseline + metrics (P0)
- Rule-based dispatcher exactly as specified (priority → compatible → nearest
  → shortest path → assign; queue otherwise, retry on events).
- Shared metrics engine (ten metrics + PRD extras) computed from a `Trace`.
- "Do nothing" evaluation.
- Tests: baseline reproducibility, metrics consistency (same trace → same
  metrics; do-nothing ≥ baseline on served missions).

### Milestone 4 — NORTHSTAR optimizer (P0)
- CP-SAT model: assignment × sequencing per aircraft (circuit formulation),
  optional missions with unserved penalties, weighted integer objective,
  policy profiles, 10 s limit, single worker, fixed seed.
- Status handling: `NO_FEASIBLE_SOLUTION` when nothing can be served or the
  solver proves infeasibility; per-mission infeasibility reasons.
- Tests: never violates hard constraints, reproducibility, no-feasible case,
  differs from baseline on the demo preset, identical inputs invariant.

### Milestone 5 — Explainability + scenarios + API (P0/P1)
- DecisionRecord generation from optimizer inputs and baseline-vs-NORTHSTAR
  traces (reasons, alternatives rejected, deltas, tradeoffs).
- Five presets + custom scenario support; seeded random scenario generator.
- FastAPI: network, presets, scenario load/reset, disruption add, impact,
  baseline run, NORTHSTAR run, compare, decisions, experiments, health.
- End-to-end smoke test through `TestClient`.

### Milestone 6 — Experiments + docs (P1)
- `experiments/run_experiments.py --n 100 --seed 42`, writes `results.csv`,
  `scenarios.jsonl`, `summary.json`, `summary.md`.
- `docs/RESPONSIBLE_AI.md`, `docs/DEMO_SCRIPT.md`, `README.md`.

### Milestone 7 — Frontend (P0 map/controls, P1 polish)
- Vite + React + TypeScript + MapLibre + Recharts.
- Command center: map, status strip, disruption controls, mission list,
  RUN NORTHSTAR, before/after panel, decision explanations, aircraft
  animation along the trace.
- Research Results tab and Responsible AI tab.
- Demo Mode stepper. Error states. Backend-unreachable state.

### Milestone 8 — Hardening (P1)
- Run all presets and the full experiment; check for surprises; rehearse the
  demo script end-to-end; update the readiness checklist with evidence.

### P2 (only after 0–8 are stable)
- ML route-risk model (only with a defensible label source), live weather and
  wildfire layers, richer animation, scenario editor.

---

## 6. Testing requirements

Backend (`pytest`):
- Closed airports cannot be used as origin, destination, or waypoint.
- Unavailable (failed) aircraft are never assigned by either strategy.
- Runway-incompatible aircraft are never assigned.
- Range constraint holds per hop.
- Capacity constraint holds per mission.
- Three or more disruptions coexist and each has its effect.
- All-airports-closed and all-aircraft-failed produce `NO_FEASIBLE_SOLUTION`
  and no crash.
- Baseline and NORTHSTAR are reproducible (two runs → identical trace hash).
- Metrics engine is deterministic and identical for both strategies given the
  same trace.
- Scenario reset returns the exact initial state.
- Data validation (coordinates, references, fleet–network compatibility).
- End-to-end demo smoke test: load preset → impact → baseline → NORTHSTAR →
  compare → decisions → experiments summary.

Frontend:
- `tsc --noEmit` and production build succeed.
- Manual checklist in `WAICY_READINESS_CHECKLIST.md`.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| NORTHSTAR does not beat the baseline on the demo preset. | Medium | The preset is chosen from the experiment set where the difference is real, not tuned by hand. Presets are backed up. If the result is a tie, the demo says so; the research page carries the story. |
| CP-SAT time-out on large replans. | Low | ≤ ~25 pending missions, 10 aircraft; sub-second in practice. Hard 10 s cap with `FEASIBLE` fallback and status shown. |
| Population data cannot be retrieved programmatically. | Medium | Population is left blank rather than typed from memory; provenance says so. Population is not used by any algorithm in the MVP. |
| Real airport data has surprises (missing runways). | Low | Validation script; manual review recorded in provenance. |
| Demo machine without internet. | Expected | Fully offline: bundled basemap, local API, committed experiment results. |

---

## 8. Definition of done

All PRD §12 items, the brief's final success sequence, all tests green,
experiment results committed, and a rehearsed run of `docs/DEMO_SCRIPT.md`
in under five minutes with the backend and frontend started by one command.


---

## 9. Status log

| Milestone | State | Evidence |
|-----------|-------|----------|
| 0 Planning | done | this document, `WAICY_READINESS_CHECKLIST.md`, `DATA_AND_EXPERIMENT_METHODOLOGY.md`, `ARCHITECTURE.md` |
| 1 Data | done | `datasets/processed/*` + `.meta.json`, `datasets/raw/PROVENANCE.json`, `DATA_PROVENANCE.md`, `scripts/build_datasets.py` |
| 2 Core model + simulation | done | `backend/northstar/{models,geo,data,network,sim}`; `tests/test_loader.py`, `test_graph.py`, `test_simulation.py` |
| 3 Baseline + metrics | done | `strategies/baseline.py` (v2, schedule-protecting), `strategies/schedule_only.py`, `metrics/evaluate.py` |
| 4 NORTHSTAR optimizer | done | `strategies/northstar.py` (CP-SAT), `tests/test_northstar.py` (10 tests incl. reproducibility, hard constraints, no-feasible, healthy-day sanity, policy lever, zero rejected assignments) |
| 5 Explainability + scenarios + API | done | `explain/explain.py`, `scenarios/presets.py` (6), `scenarios/generator.py`, `api/main.py`; `tests/test_api.py` (ten-step demo sequence) |
| 6 Experiments + docs | done | `experiments/results/` (100 scenarios × {do-nothing, baseline, NORTHSTAR × 3 policies}; `--verify` OK), `RESPONSIBLE_AI.md`, `DEMO_SCRIPT.md`, `README.md` |
| 7 Frontend | done | `frontend/` (React 19 + TS + MapLibre 6 + Recharts + Zustand, offline basemap, Demo Mode, Research and Responsible AI views); build + lint clean; `docs/screenshots/` |
| 8 Hardening | backend done | 36 backend tests green; smoke test against a live server on both primary and backup presets; checklist evidence filled |

### 9.1 Changes made during implementation that a reader should know about

1. **Baseline v2.** The first baseline reassigned scheduled flights to any free
   aircraft as soon as they were released and scored *worse than flying the
   published schedule* on passenger delay and connectivity (a strawman
   signature). Scheduled flights now keep their own aircraft unless it is
   failed or stranded. Recorded before any experiment result was kept.
2. **Objective weights.** Two defects were found on the presets and fixed before
   the experiment: a distance weight high enough that cancelling the 737's
   Ottawa rotation "saved" cost (fixed by lowering the distance weight and
   raising the cancellation penalty; a healthy-day sanity test now guards it),
   and cargo missions being parked until their deadline (fixed by a small
   per-minute delivery-time term). No weight was tuned toward a demo outcome.
3. **Solver bounding.** A 240-minute lookahead window gives identical preset
   metrics to a 360-minute window at a quarter of the solve time.
4. **Mid-mission availability.** Aircraft that are mid-mission are modelled at
   their mission's destination (shared `queue_position()` helper); the first
   experiment run surfaced 15 assignments rejected by the simulator's
   defence-in-depth check, now zero, with a regression test.
5. **Airport count** is 28 (25 Nunavut + 3 southern gateways), slightly above
   the PRD's 15–25.
6. **Solver accounting (overnight sprint, 2026-09-24).** The first experiment
   summary reported "CP-SAT calls: 2438; proven optimal: 2284" and left 154
   decisions unexplained. They were replanning moments at which no usable
   aircraft could reach any pending mission, where the optimizer returns the
   explicit NO FEASIBLE SOLUTION answer without building a model. The runner
   now reports four buckets that sum to the total (`cpsat_calls`,
   `optimal_calls`, `feasible_not_optimal_calls`, `timeout_calls`,
   `no_feasible_calls`), a regression test guards the arithmetic and the
   committed summary, and the experiment was re-run at commit `5f0d9ab`: 500
   runs, zero trace-hash differences, zero changed metric cells. See
   `docs/OVERNIGHT_ITERATION_LOG.md` (Version 3 → 4) and methodology §7.
7. **Overnight productization sprint** (branch `waicy-overnight-polish`): a
   landing website, Simple/Advanced modes, a ten-step incremental guided demo
   with a truthful RUN moment (results are offered the instant they arrive; the
   start-up cache is named on screen), map presentation and type system, and the
   demo launcher waiting for warm-up. Each version's critique, tests and commit
   hash are in `docs/OVERNIGHT_ITERATION_LOG.md`; none of it changed the
   simulator, strategies, weights or datasets.
