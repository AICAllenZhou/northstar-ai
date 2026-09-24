# NORTHSTAR AI — Data and Experiment Methodology

This document defines, before any experiment is run, what is measured, how it is
measured, how scenarios are generated, and how results are reported. Nothing in
the results is allowed to override this document after the fact. If the
methodology changes, the change is recorded here with a date and the experiment
is re-run.

---

## 1. Research question and hypotheses

**Question.** Can AI-assisted optimization improve the resilience of remote and
Northern aviation networks during major disruptions, compared with a simple
fixed-rule dispatch policy?

**Primary hypotheses** (each tested as a paired comparison across N scenarios):

- H1 — NORTHSTAR reduces **mean medical response time** relative to the baseline.
- H2 — NORTHSTAR reduces **disconnected-community hours** relative to the baseline.
- H3 — NORTHSTAR reduces **essential cargo delay** relative to the baseline.

**Secondary questions** (reported, not hypothesised in a direction):

- Effect on passenger delay, distance flown, reroutes, utilization, recovery time.
- Sensitivity of the outcome to the policy weight profile.

**Null result policy.** If NORTHSTAR is not better on a metric, or is worse, the
result is reported as such in `experiments/results/summary.md` and on the
Research Results screen. There is no filtering of scenarios after the fact.

---

## 2. Data: real versus synthetic

| Dataset | Real / Synthetic | Source | Used for |
|---------|------------------|--------|----------|
| Airport identity, coordinates, elevation | **Real** | OurAirports (public domain) | Map, distances, graph nodes |
| Runway length and surface | **Real** | OurAirports runways.csv | Runway-compatibility constraint |
| Community population (2021) | **Real** | Statistics Canada 2021 Census (open licence); blank if not retrievable programmatically | Display and optional priority weighting only; not used by any algorithm by default |
| Basemap land, provinces, lakes | **Real** | Natural Earth (public domain) | Offline map background |
| Hub roles (medical / cargo / passenger) | **Synthetic, informed by public knowledge** | Project assumption | Mission origins and destinations |
| Route network | **Synthetic, plausible** | Hub-and-spoke pattern informed by publicly advertised Northern airline networks; not an official schedule | Graph edges |
| Aircraft fleet, bases, availability | **Synthetic** | Types are real; specifications approximate public manufacturer figures; fleet composition and basing invented | Constraints |
| Daily passenger schedule | **Synthetic** | Project assumption | Scheduled missions |
| Passenger and cargo demand, medical emergencies, closures, weather, wildfire | **Synthetic** | Seeded generator | Scenarios |
| Operating cost per km | **Synthetic index** | Relative index, not currency | Fuel/cost proxy |

Every processed dataset file has a `*.meta.json` sidecar with `source`,
`real_or_synthetic`, `version`, `retrieved`, `licence_url`, `assumptions`.
See `docs/DATA_PROVENANCE.md` for the per-file record.

Synthetic operational data is never presented as real Canadian aviation
operations data. Every screen that shows operational numbers carries the
research-simulation disclaimer.

---

## 3. Simulation model

### 3.1 Time
- Horizon: 24 hours per scenario (configurable), starting at 06:00 local.
- Step: 30 minutes. All durations are rounded **up** to whole steps.
- All times are stored as minutes since scenario start.

### 3.2 Entities
Airport, Community, Aircraft, Route, Mission, Disruption, Scenario,
SimulationState. Field-level definitions are in `docs/ARCHITECTURE.md` §3.

### 3.3 Flight model
- Distance between airports: great-circle (haversine) from real coordinates.
- Leg time = distance / cruise speed, plus a fixed 30-minute turnaround on
  arrival. No wind, no climb/descent profile, no fuel burn model.
- A mission may be flown as a multi-hop path through open airports. Each hop
  must be within the aircraft's range and every airport on the path must
  satisfy the aircraft's minimum runway length and surface requirement.
- Aircraft that are not at the mission origin first fly a repositioning leg.

### 3.4 Disruptions and their effects
| Type | Effect |
|------|--------|
| airport_closure | Airport node closed for [start, start+duration). Routes touching it unusable. Aircraft on the ground there are stranded until reopening. |
| wildfire | Airports inside the radius are closed (severity ≥ 0.5) or have wildfire_risk raised; routes with an endpoint inside the radius get risk raised. |
| severe_weather | Airports in the target list get weather_risk = severity; severity ≥ 0.8 closes them; routes touching them get risk raised. |
| aircraft_failure | Aircraft unavailable for [start, start+duration). If in flight, it lands first, then is grounded. Its undeparted missions return to the pending queue. |
| medical_emergency | Creates a medical mission from the community to the nearest reachable medical hub, released at `start`, with priority 1–3 and a 240-minute response target (assumption). |
| essential_cargo_request | Creates a cargo mission from the nearest cargo hub to the community, released at `start`, with a deadline (default 8 h) and a payload in kg. |

Any number of disruptions may overlap.

### 3.5 Event-driven replanning (identical for both strategies)
The simulator advances in 30-minute steps. At t = 0 and at every step where
any of the following occurs, the active strategy is called with the full
current state and returns assignments for pending missions:

1. a mission is released,
2. a disruption starts or ends,
3. an aircraft fails,
4. an aircraft becomes free (lands and completes its assignment).

Both strategies see the same state at the same moments. Neither sees the
future: disruption end times are not exposed to strategies in the MVP.
Assignments that have already departed are never changed.

### 3.6 Simplifications (stated limitations)
No crew duty limits, no fuel planning beyond range, no weather forecast, no
stochastic execution noise, no airport capacity limits, no night restrictions,
no maintenance schedules. These are listed in `docs/RESPONSIBLE_AI.md`.

---

## 4. Metric definitions

All metrics are computed by one function, `evaluate(trace)`, from the executed
simulation trace. Strategies never compute their own scores.

| # | Metric | Definition | Unit | Direction |
|---|--------|------------|------|-----------|
| 1 | `disconnected_communities_end` | Communities disconnected at the end of the horizon | count | lower better |
| 1b | `disconnected_communities_peak` | Maximum simultaneously disconnected communities | count | lower better |
| 2 | `disconnected_community_hours` | Σ over communities of hours spent disconnected (definition below) | hours | lower better |
| 3 | `medical_response_avg_min` | Mean over medical missions of (aircraft arrival at patient community − request time). Unserved missions are censored at horizon end and flagged. | min | lower better |
| 3b | `medical_within_target_pct` | Share of medical missions with response ≤ 240 min | % | higher better |
| 4 | `critical_missions_completed_pct` | (completed medical + completed cargo) / (all medical + cargo) | % | higher better |
| 5 | `cargo_delay_avg_min` | Mean over cargo missions of max(0, delivery − deadline); unserved censored at horizon end | min | lower better |
| 5b | `cargo_completion_rate` | Delivered cargo missions / all cargo missions | % | higher better |
| 6 | `passenger_delay_avg_min` | Mean over scheduled passenger flights of max(0, actual arrival − scheduled arrival); cancelled flights censored at horizon end | min | lower better |
| 6b | `cancelled_flights` | Scheduled passenger flights not flown within the horizon | count | lower better |
| 7 | `reroutes` | Scheduled flights flown by a different aircraft or a different path than scheduled, plus any mission reassigned after its first assignment | count | lower better |
| 8 | `aircraft_utilization_pct` | Mean over aircraft of flying minutes / horizon minutes | % | informational |
| 9 | `distance_flown_km` | Σ of all legs including repositioning | km | lower better |
| 9b | `operating_cost_index` | Σ distance × aircraft cost index | index | lower better |
| 10 | `recovery_time_min` | Minutes from first disruption onset until the disconnected set shrinks to only structurally-unrecoverable communities and no medical or cargo mission remains pending. Censored at horizon end with `recovered = false`. | min | lower better |

**Disconnected community.** A community is disconnected at time t if either:

- *structural*: its airport is closed at t, or no open path exists from its
  airport to any hub airport that at least one aircraft type in the fleet can
  fly (range and runway); or
- *service*: a scheduled inbound flight to it was disrupted (cancelled or not
  yet flown by its scheduled arrival time) and no passenger or cargo flight
  has landed there since.

Structural disconnection is identical for both strategies by construction.
Only the service component can differ between strategies. Both components are
counted (union, no double-counting) so that the number shown to a judge is the
true number of communities without an air link, not a strategy-flattering subset.

**Censoring.** Unserved missions are not dropped. They enter averages at the
horizon-end value and the count of censored missions is reported alongside
every average. This is conservative: it understates how bad an unserved
mission is, and it is applied identically to both strategies.

---

## 5. Strategies

### 5.1 Baseline (rule-based, non-AI)
On every replanning call, for each released pending mission in priority order
(medical < cargo < passenger; ties by priority, release time, then id):
1. a scheduled passenger flight flies with its scheduled aircraft when that
   aircraft is free now; if the scheduled aircraft is unserviceable or
   stranded at a closed airport, the nearest free compatible aircraft is used;
   otherwise the flight waits (it is delayed, not reassigned);
2. a medical or cargo mission takes the aircraft that is free now, passes the
   shared feasibility check (not failed, capacity, range, runway, open path)
   and has the shortest repositioning flight time (tie: aircraft id);
3. every mission flies the shortest open path by distance;
4. if nothing qualifies, the mission stays queued for the next call.
The baseline never revisits an assignment. It is deliberately simple; it is
not tuned. Change log: version 1 (2026-09-24, before any experiment result
was recorded) reassigned scheduled flights to any free aircraft as soon as
they were released; on generated scenarios this produced worse passenger
delay and connectivity than flying the published schedule and nothing else,
which is the signature of a strawman, so rule 1 was introduced.

### 5.2 NORTHSTAR (OR-Tools CP-SAT)
On every replanning call, solve one model over all undeparted missions and
all usable aircraft: binary assignment variables, per-aircraft sequencing with
transition (repositioning) times, hard constraints for availability, capacity,
range, runway and airport/route status, optional service with unserved
penalties, and a weighted integer objective, over a 240-minute lookahead
window plus every critical mission. Full formulation: `docs/ARCHITECTURE.md`
§7. Solver: single worker, fixed seed, 10 s limit, status recorded.

### 5.3 Fairness invariants (tested)
- Same scenario object, same initial state, same disruptions, same missions.
- Same simulator, same replanning triggers, same metric function.
- The baseline's plan is executed by the same code path as NORTHSTAR's.

---

## 6. Scenario generation

Generator: `northstar/scenarios/generator.py`. Randomness:
`numpy.random.default_rng(master_seed * 1000 + i)` for scenario i.

Each generated scenario contains:

| Component | Distribution |
|-----------|--------------|
| Airport closures | 1–3 airports, hubs with probability 0.35, start U[0, 12 h], duration U[2, 12 h] |
| Severe weather | 0–2 events on a random region (a hub and its spokes), severity U[0.4, 1.0], start U[0, 12 h], duration U[2, 10 h] |
| Wildfire | 0–1 event centred on a random non-hub airport, radius U[60, 250 km], severity U[0.5, 1.0], start U[0, 8 h], duration U[4, 14 h] |
| Aircraft failures | 0–2 aircraft, start U[0, 12 h], duration U[4, 24 h] |
| Medical emergencies | 1–3, random community, priority {1: 0.5, 2: 0.3, 3: 0.2}, start U[0, 16 h] |
| Cargo requests | 1–3, random community, payload U[300, 2,500 kg], deadline U[4, 12 h], start U[0, 12 h] |

The daily schedule and fleet are identical in every scenario (fixed initial
conditions). Scenarios are serialised to `experiments/results/scenarios.jsonl`
so that any single one can be reloaded and inspected in the UI.

---

## 7. Experiment protocol

- **Design:** paired. Every scenario is run once with the baseline and once
  with NORTHSTAR from identical initial states.
- **Size:** N = 100 scenarios, master seed 42 (`--n 100 --seed 42`).
- **Policy profile:** the Balanced profile is the primary result. Medical-first
  and Connectivity-first profiles are run as sensitivity analyses on the same
  100 scenarios and reported separately.
- **Outputs:**
  - `experiments/results/results.csv` — one row per (scenario, strategy,
    policy) with every metric, censored counts, solver status, wall time.
  - `experiments/results/scenarios.jsonl` — the scenarios themselves.
  - `experiments/results/summary.json` — aggregates consumed by the UI.
  - `experiments/results/summary.md` — human-readable report.
- **Statistics per metric:** baseline and NORTHSTAR mean, median, standard
  deviation; mean paired difference; improvement % = (mean_baseline −
  mean_northstar) / mean_baseline for lower-is-better metrics; count of
  scenarios where NORTHSTAR is better, baseline is better, tie (tolerance:
  exact equality for counts, 1 minute for times, 0.5 km for distance);
  two-sided exact sign test p-value on non-tied pairs. No claim of
  significance is made where p ≥ 0.05.
- **Tradeoffs:** any metric where the baseline wins in more scenarios than
  NORTHSTAR is listed under "Tradeoffs" in the summary and on the Research
  screen.
- **Solver accounting:** every replanning decision NORTHSTAR records is put in
  exactly one of four buckets, so the buckets sum to the total: proven
  `OPTIMAL`; `FEASIBLE` (solution found, not proven optimal within the 10 s
  limit); time-out or other solver status; and `NO_FEASIBLE_SOLUTION`, a
  moment at which no usable aircraft could reach any pending mission (closed
  airports, range, runway or availability), where the optimizer returns the
  explicit "no feasible solution" answer without building a model. Only the
  first three are CP-SAT solves (`cpsat_calls`). The summary reports all four
  counts; a non-zero `NO_FEASIBLE_SOLUTION` count is expected in scenarios
  where a community is unreachable for a period, and is not a failure of the
  solver. (Earlier summaries reported the total as "CP-SAT calls" and left the
  fourth bucket implicit; the accounting was made explicit in the overnight
  sprint, with the metrics and trace hashes unchanged.)

---

## 8. Reproducibility

- All randomness derives from the master seed. Iteration is in sorted id
  order everywhere. Ties are broken by id.
- CP-SAT runs with `num_workers = 1` and `random_seed = 42`.
- Dependencies are pinned (`backend/uv.lock`, `frontend/package-lock.json`).
- `experiments/run_experiments.py` writes the git commit hash, Python version,
  OR-Tools version and the parameters used into `summary.json`.
- Reproducibility tests: two runs of each strategy on the same scenario must
  produce identical trace hashes.
- Re-running the experiment on the same machine and commit must reproduce
  `results.csv` exactly; a `--verify` flag compares against the committed file.

---

## 9. Threats to validity (acknowledged)

- Synthetic schedule, fleet and demand may not reflect real operations.
- The baseline represents one reasonable manual dispatch heuristic; real
  dispatchers are more capable, so the gap to NORTHSTAR is an upper bound on
  the improvement over a naive rule, not over human experts.
- The optimizer optimises the same weighted quantities the metrics measure;
  the sensitivity runs and per-metric tradeoffs exist to make this visible.
- Deterministic execution ignores real-world uncertainty; a plan that is good
  under certainty may be brittle.
- Results are for a 28-airport network; nothing here shows they generalise.

---

## 10. Machine-learning risk model policy

The MVP uses a transparent risk score (ARCHITECTURE.md §6). A Random Forest
or XGBoost route-risk model is **not** included because no defensible labelled
dataset of route disruptions is available offline. It will only be added if:
a documented label source exists; a time-based train/test split is used;
precision, recall and calibration are reported alongside accuracy; feature
definitions and leakage checks are written down. No model accuracy figures
appear anywhere in the project unless all of the above hold.
