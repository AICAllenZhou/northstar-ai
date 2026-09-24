# NORTHSTAR AI — Architecture

This is the design specification the code follows. Where the code and this
document disagree, the code is wrong or this document is out of date; fix one.

---

## 1. Pipeline

```
datasets/processed/*.csv (+ meta)           real geography, synthetic operations
        │
        ▼
northstar.data.loader  →  Network            immutable: airports, communities, aircraft, routes, schedule
        │
        ▼
northstar.scenarios     →  Scenario           disruptions + generated missions + policy
        │
        ▼
northstar.sim.simulator →  run(scenario, strategy) → Trace
        │        ▲
        │        │  strategy.plan(view) at every replanning event
        │        ├── strategies.baseline   (rules)
        │        ├── strategies.northstar  (OR-Tools CP-SAT)
        │        └── strategies.schedule_only ("do nothing")
        ▼
northstar.metrics.evaluate(trace) → Metrics   one function for every strategy
northstar.explain.explain(...)    → [DecisionRecord]
        │
        ▼
northstar.api (FastAPI, one in-memory session)  ──►  frontend (React + TS + MapLibre)
        │
        └─► experiments/run_experiments.py → results.csv, summary.json, summary.md
```

## 2. Repository layout

```
northstar-ai/
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── northstar/
│   │   ├── config.py           constants and policy profiles
│   │   ├── models.py           pydantic entities (below)
│   │   ├── geo.py              haversine
│   │   ├── data/loader.py      CSV → Network, validation
│   │   ├── network/graph.py    NetworkX graph, open-subgraph, paths, connectivity
│   │   ├── sim/state.py        SimulationState, clone, StrategyView
│   │   ├── sim/disruptions.py  effect application, mission generation
│   │   ├── sim/simulator.py    deterministic 30-min loop, Trace
│   │   ├── strategies/base.py  Strategy protocol + shared feasibility helper
│   │   ├── strategies/baseline.py
│   │   ├── strategies/northstar.py
│   │   ├── strategies/schedule_only.py
│   │   ├── metrics/evaluate.py
│   │   ├── explain/explain.py
│   │   ├── scenarios/presets.py, generator.py
│   │   └── api/main.py, schemas.py, session.py
│   └── tests/
├── frontend/                   Vite + React + TypeScript + MapLibre GL + Recharts
├── datasets/raw/               downloaded public data + PROVENANCE.json
├── datasets/processed/         model inputs, each with .meta.json
├── experiments/run_experiments.py, results/
├── scripts/dev.sh, demo.sh, smoke_test.py
└── docs/
```

## 3. Data model

Units: km, minutes, kg, people. Times are minutes since scenario start.

```
Airport      id (ICAO), name, community_name, lat, lon, elevation_m,
             runway_length_m (longest open), runway_surface (paved|gravel),
             is_medical_hub, is_cargo_hub, is_passenger_hub, region,
             base_weather_risk (0-1), base_wildfire_risk (0-1)
Community    id, name, airport_id, lat, lon, population (int|null), region,
             priority_weight (default 1.0)
Aircraft     id, type, callsign, home_airport_id, range_km, capacity_people,
             cargo_capacity_kg, min_runway_length_m, gravel_capable,
             speed_kmh, cost_index_per_km, role (medevac|passenger|combi|utility)
Route        id, origin_airport_id, destination_airport_id, distance_km (derived),
             base_risk (0-1), corridor (region label)
Mission      id, type (medical|cargo|passenger), priority (1-3),
             origin_options [airport ids, preferred first],
             dest_options [airport ids, preferred first],
             release_min, deadline_min|null, scheduled_arrival_min|null,
             payload_people, payload_kg, community_id (served community|null),
             scheduled_aircraft_id|null, scheduled_path|null, source (schedule|disruption:<id>)
Disruption   id, type (airport_closure|wildfire|severe_weather|aircraft_failure|
             medical_emergency|essential_cargo_request), target_ids [..],
             center_lat, center_lon, radius_km (area types), severity (0-1),
             start_min, duration_min, params {priority, payload_kg, deadline_min, ...}
Scenario     id, name, description, seed|null, horizon_min (1440), step_min (30),
             disruptions [..], policy_id ("balanced"), tags [..]
Plan         {aircraft_id: [mission_id, ...]} ordered queues of undeparted work,
             plus route choice per mission {mission_id: (origin, dest, path)}
Trace        scenario_id, strategy, snapshots[step], mission_outcomes{mission_id},
             legs[..], events[..], replans[..], solver_calls[..]
Metrics      see DATA_AND_EXPERIMENT_METHODOLOGY.md §4
DecisionRecord see §8
```

## 4. Graph model

- `nx.Graph` with airports as nodes and routes as undirected edges.
- `open_graph(state, t)` returns the subgraph of open airports and open routes at t.
- `aircraft_graph(open_graph, aircraft)` further removes airports whose runway
  is too short or whose surface the aircraft cannot use, and edges longer than
  the aircraft's range.
- `shortest_path(aircraft_graph, o, d, weight)` where weight is distance for
  the baseline and distance × (1 + λ·risk) for NORTHSTAR (λ from policy).
- `structurally_disconnected(state, t)` = communities whose airport is closed
  or has no path to any hub in the union of all aircraft graphs.

Closing an airport removes the node; closing a route removes the edge. Every
connectivity number comes from this graph, never from a lookup table.

## 5. Simulation

```
state = initial_state(network, scenario)
for t in 0, 30, ..., horizon:
    events  = apply_disruption_transitions(state, t)     # closures start/end, failures
    events += release_missions(state, t)
    events += land_arrivals(state, t)                    # legs ending at t; mission progress; aircraft free
    if t == 0 or events:
        plan = strategy.plan(StrategyView(state, t))
        events += apply_plan(state, plan, t)             # validates every assignment with the shared feasibility helper
    depart_ready_aircraft(state, t)                      # start next leg for free aircraft with queued work
    record_snapshot(state, t)
```

- `StrategyView` exposes: t, open graph, aircraft status (location, free_at,
  failed), pending and undeparted missions, currently-disconnected
  communities. It does not expose future disruption transitions.
- `apply_plan` rejects any assignment the shared helper deems infeasible and
  records a `REJECTED_ASSIGNMENT` event. Tests assert this never fires for
  either strategy on any preset or generated scenario.
- Aircraft failure while airborne: the leg completes, then the aircraft is
  grounded and its remaining queue is released.
- Airport closure while an aircraft is on the ground there: the aircraft is
  stranded until reopening.
- Airport closure while an aircraft is inbound: the aircraft diverts to the
  nearest open compatible airport; the mission is returned to pending.

Reset = discard the state and rebuild from `Network` + `Scenario`. Nothing
mutates `Network`.

## 6. Route risk (transparent score)

```
risk(route, t) = clamp(0.5 * max(weather_risk(o,t), weather_risk(d,t))
               + 0.4 * max(wildfire_risk(o,t), wildfire_risk(d,t))
               + 0.1 * min(1, distance_km / 1500), 0, 1)
```
Inputs are the two endpoint airports' current risk fields (base value raised
by active weather/wildfire disruptions) and the route length. Routes with
risk ≥ 0.85 are closed. This formula is a stated assumption, not a fitted model.

## 7. Strategies

### 7.1 Shared feasibility helper (`strategies/base.py`)
`candidate(view, aircraft, mission) -> Candidate | Infeasible(reason)`
checks, in order: aircraft not failed; capacity (people or kg by mission
type); for each (origin, dest) option pair: runway/surface at both ends;
shortest path in the aircraft graph exists; every hop ≤ range; repositioning
path from the aircraft's location to the origin exists. Returns the best
option (least total time) with reposition and mission legs, or the first
failing reason code. Both strategies and the simulator call this function.

### 7.2 Baseline
Per `plan()` call, for released missions sorted by (type priority, priority,
release_min, id):
- scheduled passenger flight → its scheduled aircraft if free now; if that
  aircraft is failed or stranded, the nearest free compatible aircraft;
  otherwise wait (delay, not reassignment);
- medical or cargo → nearest free compatible aircraft (minimal repositioning
  time, tie by id);
- shortest open path by distance; if nothing qualifies, stay queued.
Never modifies an existing queue. (Version 1 reassigned scheduled flights to
any free aircraft as soon as they were released, which produced worse
passenger metrics than the published schedule alone, so it was replaced
before any experiment result was recorded.)

### 7.3 NORTHSTAR (CP-SAT)
Per `plan()` call at time t₀ (all times in steps):

Sets
- A: aircraft not failed; each with `avail_at[a]` (now, or landing time if airborne) and `avail_airport[a]`.
- M: undeparted missions (pending or queued). Missions already departed are fixed.
- For each (a, m) with a feasible candidate: `rep[a,m]` repositioning steps from
  avail_airport, `dur[a,m]` mission steps, `dist[a,m]` km, `risk[a,m]`.
- For each aircraft a and ordered pair (m₁, m₂): `trans[a,m₁,m₂]` flight steps
  from dest(m₁) to origin(m₂) (∞ if no path → arc omitted).

Variables
- `x[a,m]` ∈ {0,1}; `served[m] = Σₐ x[a,m] ≤ 1`.
- Per aircraft a: `AddCircuit` over {depot} ∪ Mₐ with arc literals
  `arc[a,i,j]`; self-loop literal on m ≡ ¬x[a,m]; depot self-loop allowed
  (aircraft idle).
- `arr_o[m]`, `arr_d[m]` ∈ [0, H]: arrival at origin (response) and at
  destination (completion).
- `late[m] ≥ 0` (cargo/passenger lateness), `changed[m]` ∈ {0,1} if the
  assignment differs from the mission's current queued aircraft/path.

Constraints
- depot→m on a  ⇒ `arr_o[m] ≥ max(avail_at[a], r_m) + rep[a,m]`
- m₁→m₂ on a    ⇒ `arr_o[m₂] ≥ arr_d[m₁] + trans[a,m₁,m₂]` and `≥ r_{m₂} + trans[a,m₁,m₂]`
- `arr_d[m] = arr_o[m] + Σₐ x[a,m]·dur[a,m]`
- `served[m] = 0 ⇒ arr_o[m] = arr_d[m] = H` (censored, same convention as the metrics)
- `late[m] ≥ arr_d[m] − deadline_m` (cargo) or `− scheduled_arrival_m` (passenger)
- Hard feasibility is enforced by only creating `x[a,m]` for feasible pairs.

Objective (minimise, integer)
```
Σ_medical   w_med[p_m]·(arr_o[m] − r_m)·STEP
+ Σ_cargo   w_cargo_late·late[m]·STEP + w_cargo_time·(arr_d[m] − r_m)·STEP
+ Σ_pax     w_pax·late[m]·STEP
+ Σ_{m restores a disconnected community} w_conn·(arr_d[m] − r_m)·STEP
+ Σ_m       pen_unserved[type_m]·(1 − served[m])
+ Σ_{a,m}   w_dist·cost_index_a·dist[a,m]·x[a,m]
+ Σ_{a,m}   w_risk·risk[a,m]·x[a,m]
+ Σ_m       w_reroute·changed[m]
```
Weights come from the policy profile (`config.py`). Default "Balanced":
`w_med = {1: 20, 2: 12, 3: 6}` per minute of response, `w_cargo_late = 8` per
minute past the deadline plus `w_cargo_time = 1` per minute from request to
delivery, `w_pax = 1` per minute late, `w_conn = 4` per minute per community,
`pen_unserved = {medical: 200000, cargo: 40000, passenger: 20000}`,
`w_dist = 0.3` per km·cost-index, `w_risk = 3000` per unit path risk,
`w_reroute = 600`. Other profiles scale these. All values are declared
assumptions and are shown in the UI. The distance weight is deliberately
small: a sanity test asserts that on a healthy day the optimizer flies the
whole schedule rather than cancelling flights to save fuel (an earlier weight
of 2.0 per km did exactly that, which is why it was changed before any
experiment was run).

Model size is bounded by a **lookahead window**: every medical and cargo
mission plus every scheduled flight released within the next 240 minutes
enters the model; later flights enter as the window advances. (Measured on
the presets: identical metrics to a 360-minute window, four times faster.)
Between events that change no information the strategy returns `UNCHANGED`
and the simulator keeps the current queues.

Solver: `random_seed = 42`, `max_time_in_seconds = 10`; `num_workers = 1`
for experiments (reproducible) and 8 for interactive API runs (faster; the
plan is identical whenever optimality is proven, and the status of every
call is recorded).
Status mapping: OPTIMAL/FEASIBLE → plan; INFEASIBLE or no solution →
`NO_FEASIBLE_SOLUTION`; time limit without solution → `TIMEOUT`. If no
mission has any feasible (a, m) pair the call returns `NO_FEASIBLE_SOLUTION`
without invoking the solver, with a per-mission reason list.

## 8. Explainability

`explain(view_at_decision, northstar_trace, baseline_trace) -> [DecisionRecord]`

```
DecisionRecord
  mission_id, mission_type, priority, community_name
  aircraft_id | null, aircraft_type, path [airport ids], depart_min, response_min, complete_min
  reasons: [ {code, text, data} ]
      PRIORITY, CAPACITY_OK, RANGE_OK, RUNWAY_OK, NEAREST_RANK (rank, nearest_id, why_not_nearest),
      AVOIDS_CLOSED (ids), ALTERNATE_HUB (from, to), RISK_AVOIDED (Δrisk), PREPOSITIONED,
      UNSERVED_BECAUSE (reason codes)
  alternatives: [ {aircraft_id, verdict (rejected|busy|worse), reason_code, text, reposition_min} ]
  vs_baseline: { baseline_aircraft_id, baseline_response_min|complete_min, delta_min }
  tradeoffs: [ {mission_id, text, delta_min} ]   missions the baseline served with this aircraft that NORTHSTAR served later
  summary: one sentence assembled from the fields above
```
Every field is computed from the candidate table, the solver's chosen values,
and the two traces. No free text is generated by anything other than string
templates over these fields.

## 9. API (FastAPI, prefix `/api`, one in-memory session)

| Method | Path | Body → Response |
|--------|------|-----------------|
| GET | `/health` | → `{status, version, datasets_loaded, ortools_version}` |
| GET | `/network` | → `{airports, communities, aircraft, routes, hubs, disclaimer}` |
| GET | `/basemap/{layer}` | layer ∈ countries, provinces, lakes → GeoJSON |
| GET | `/presets` | → `[{id, name, description, disruption_count, tags}]` |
| GET | `/policies` | → `[{id, name, description, weights}]` |
| POST | `/scenario/load` | `{preset_id}` or `{scenario}` → `ScenarioState` |
| POST | `/scenario/reset` | → `ScenarioState` (healthy network, no disruptions, schedule only) |
| POST | `/scenario/disruptions` | `Disruption` (id optional) → `ScenarioState` |
| DELETE | `/scenario/disruptions/{id}` | → `ScenarioState` |
| GET | `/scenario` | → `ScenarioState` |
| GET | `/scenario/impact` | → `Impact` (structural disconnections over time, affected missions, do-nothing metrics) |
| POST | `/run/baseline` | → `RunResult` |
| POST | `/run/northstar` | `{policy_id?, weights?}` → `RunResult` |
| GET | `/compare` | → `{do_nothing, baseline, northstar, deltas}` |
| GET | `/decisions` | → `[DecisionRecord]` |
| GET | `/experiments/latest` | → `summary.json` |
| POST | `/experiments/run` | `{n, seed, policy_id}` → `{job_id}` (background) |
| GET | `/experiments/jobs/{job_id}` | → `{state, done, total, summary?}` |

```
ScenarioState  { scenario, missions, network_status_t0: {airports:{id:status}, routes:{id:status}, aircraft:{id:status}},
                 disconnected_now: [community ids], has_baseline, has_northstar }
RunResult      { strategy, status (OK|NO_FEASIBLE_SOLUTION|TIMEOUT|PARTIAL), metrics,
                 assignments: [{mission_id, aircraft_id, path, depart_min, response_min, complete_min, status}],
                 trace: { step_min, snapshots: [{t, aircraft:[{id, lat, lon, airport_id|null, leg:{from,to,progress}|null, status}],
                          airports:{id:status}, routes:{id:status}, disconnected:[community ids]}] },
                 solver: {status, wall_ms, objective, calls}|null, warnings: [..] }
```
Errors are JSON `{error, detail}` with 4xx for client mistakes and 503 when
datasets are missing. Nothing returns 200 with an empty body on failure.

## 10. Failure handling

| Condition | Backend | Frontend |
|-----------|---------|----------|
| No feasible solution | `status = NO_FEASIBLE_SOLUTION`, per-mission reasons | Red state card "No feasible solution", reasons listed, metrics still shown (censored) |
| All airports closed | Every mission infeasible; structural disconnection = all | Same as above; map shows all closed |
| All aircraft unavailable | Same | Same |
| Community isolated | Structural disconnection recorded and shown | Community marker in "isolated" state with tooltip |
| Emergency cannot be serviced | Mission `unserved`, censored metric, warning | Mission row red with reason |
| Missing dataset | 503 with the missing file name | Full-screen error with the file name |
| Optimizer time-out | `status = TIMEOUT` or `PARTIAL` (feasible, not optimal) | Amber badge on the result, text "solution found within 10 s limit, not proven optimal" |
| Backend unreachable | — | Banner with retry; controls disabled; last state kept |

## 11. Determinism

Seeded `numpy.random.default_rng`; all dict/set iteration through `sorted()`;
tie-breaks by id; single-worker CP-SAT with fixed seed; no wall-clock inputs
in any algorithm. `Trace.hash()` = SHA-256 of the canonical JSON of legs and
outcomes; reproducibility tests compare hashes.

## 12. Frontend

Views: **Command Center** (default), **Research**, **Responsible AI**, plus a
**Demo Mode** overlay stepper.

Command Center layout (desktop, ≥1280 px): header with title, subtitle,
disclaimer chip and state badge (NORMAL / WARNING / DISRUPTED / OPTIMIZED);
left column: scenario presets, disruption form, active disruptions, mission
list; centre: MapLibre map with bundled Natural Earth layers, route lines,
airport and community markers, aircraft markers animated along the selected
trace, disruption overlays; right column: network status tiles, RUN BASELINE
/ RUN NORTHSTAR AI buttons, Before/After panel (Do nothing | Baseline |
NORTHSTAR), decision list with expandable reasons; bottom: timeline scrubber
with play/pause for the trace.

State: a single store (Zustand) mirroring `ScenarioState`, both `RunResult`s,
decisions, selected entity, playback time, connection status.

Visual states: normal route solid; changed route emphasised; closed route
dashed red; closed airport red ring; disconnected community amber ring;
medical mission cross icon; cargo box icon; wildfire and weather as
translucent circles.

## 13. Performance budget

Network load < 200 ms; baseline run < 200 ms; NORTHSTAR full scenario
(≤ 40 replans) < 3 s on a laptop; 100-scenario experiment < 15 min.
