# NORTHSTAR AI — Lightweight Technical Design Document
## Competition Prototype Architecture

**Version:** MVP 1.0  
**Design Principle:** Keep the architecture simple enough for a student team to finish, but technically credible enough to support a strong WAICY demonstration.

---

## 1. Recommended Architecture

```text
Public / Prepared Data
        |
        v
Data Loader
        |
        v
Simulation State
        |
   +----+----+
   |         |
   v         v
Baseline   NORTHSTAR Optimizer
Engine      (OR-Tools)
   |         |
   +----+----+
        |
        v
Metrics + Explanations
        |
        v
FastAPI Backend
        |
        v
React + TypeScript + MapLibre
```

The application should be split into two major parts:

### Backend
Python service responsible for:
- Network data
- Simulation state
- Scenario generation
- Baseline decisions
- Optimization
- Metrics
- Explanation generation

### Frontend
Browser interface responsible for:
- Map
- Scenario controls
- Network animation
- Metrics
- Comparison
- Research results

---

## 2. Recommended Technology Stack

### Backend
- Python 3.12+
- FastAPI
- Pandas
- NumPy
- NetworkX
- Google OR-Tools
- Pydantic
- SQLite for MVP

### Frontend
- React
- TypeScript
- MapLibre GL
- Lightweight chart library

### Deployment
- Frontend: Vercel
- Backend: Render / Railway / Fly.io / equivalent Python host
- Database: SQLite during local development; PostgreSQL only if needed

Do not introduce Kubernetes, microservices, queues, or complex cloud infrastructure.

---

## 3. Suggested Repository Structure

```text
northstar-ai/
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- api/
|   |   |-- models/
|   |   |-- services/
|   |   |   |-- simulation.py
|   |   |   |-- baseline.py
|   |   |   |-- optimizer.py
|   |   |   |-- metrics.py
|   |   |   |-- explanations.py
|   |   |-- data/
|   |   |-- schemas/
|   |
|   |-- tests/
|
|-- frontend/
|   |-- src/
|   |   |-- pages/
|   |   |-- components/
|   |   |-- map/
|   |   |-- api/
|   |   |-- types/
|
|-- datasets/
|   |-- airports.csv
|   |-- communities.csv
|   |-- aircraft.csv
|   |-- routes.csv
|   |-- scenarios/
|
|-- experiments/
|   |-- run_experiments.py
|   |-- results/
|
|-- README.md
```

---

## 4. Minimum Data Model

### Airport

```text
id
name
latitude
longitude
runway_length_m
status
weather_risk
wildfire_risk
```

### Community

```text
id
name
latitude
longitude
population
priority_weight
nearest_airport_id
```

### Aircraft

```text
id
type
current_airport_id
range_km
capacity_people
cargo_capacity_kg
min_runway_length_m
available
speed_kmh
fuel_cost_per_km
```

### Route

```text
id
origin_airport_id
destination_airport_id
distance_km
normal_travel_time_min
status
risk_score
```

### Mission

```text
id
type
origin_id
destination_id
priority
required_capacity
created_time
deadline
status
```

Mission types:
- medical
- essential_cargo
- passenger

### Disruption

```text
id
type
target_id
severity
start_time
duration
```

---

## 5. Simulation State

One scenario can be stored as a JSON object.

Example:

```json
{
  "scenario_id": "wildfire_medical_01",
  "time": 0,
  "closed_airports": ["APT_04"],
  "unavailable_aircraft": ["AC_03"],
  "route_risks": {
    "R_12": 0.85
  },
  "missions": [
    {
      "id": "M_01",
      "type": "medical",
      "origin": "COMM_08",
      "destination": "HOSPITAL_01",
      "priority": 1
    }
  ]
}
```

The simulation does not need second-by-second realism.

Use discrete steps such as:
- 15 minutes
- 30 minutes
- 1 hour

For the WAICY MVP, 30-minute steps are sufficient.

---

## 6. Graph Model

Use NetworkX.

Represent:
- Airports / communities as nodes
- Air routes as edges

Each edge can contain:
- Distance
- Travel time
- Risk
- Availability
- Approximate fuel cost

When an airport closes:
- Disable that node.

When weather blocks a route:
- Disable or heavily penalize that edge.

The graph makes it easy to calculate:
- Connectivity
- Alternative routes
- Isolated communities
- Shortest feasible paths

---

## 7. Baseline Algorithm

The baseline should intentionally be simple and understandable.

For each mission:

1. Sort missions by priority.
2. Find available compatible aircraft.
3. Select the nearest aircraft.
4. Select the shortest feasible route.
5. Assign the aircraft.
6. If no aircraft is available, queue the mission.

Pseudo-flow:

```text
for mission in priority_order:
    candidates = compatible_available_aircraft(mission)

    if candidates is empty:
        mission.status = "unserved"
    else:
        aircraft = nearest(candidates)
        route = shortest_valid_route(aircraft, mission)
        assign(aircraft, mission, route)
```

This gives NORTHSTAR a fair and reproducible comparison.

---

## 8. NORTHSTAR Optimization Engine

Use Google OR-Tools.

The optimizer should answer:

> Which aircraft should be assigned to which missions so that the total network impact is minimized?

### Decision variables

Simplified:

```text
x[a,m] = 1 if aircraft a is assigned to mission m
         0 otherwise
```

### Hard constraints

Examples:
- One aircraft cannot perform two missions at the same time.
- Aircraft must have enough range.
- Aircraft must have enough capacity.
- Destination runway must be long enough.
- Closed airports cannot be used.
- Blocked routes cannot be used.

### Objective

Minimize a weighted score:

```text
Total Cost =
  W1 * Medical Response Time
+ W2 * Disconnected Community Hours
+ W3 * Essential Cargo Delay
+ W4 * Passenger Delay
+ W5 * Fuel / Distance
+ W6 * Number of Reroutes
```

Recommended priority:

```text
Medical emergencies        Very High
Community disconnection    High
Essential cargo            High
Passenger delays           Medium
Fuel / rerouting           Lower
```

Do not claim the weights are objectively correct.

Expose them as configurable parameters.

This is useful for the project story:

> Different decision-makers can test different priorities instead of assuming there is one universally correct definition of an optimal network.

---

## 9. Route Risk

### MVP Approach

Use a transparent score rather than forcing an ML model too early.

Example:

```text
risk =
0.30 * weather_risk
+ 0.30 * wildfire_risk
+ 0.15 * visibility_risk
+ 0.15 * wind_risk
+ 0.10 * airport_condition_risk
```

Return a normalized value from 0 to 1.

### Optional ML Upgrade

If a defensible labeled dataset becomes available, train:
- Random Forest
or
- XGBoost

Inputs:
- Wind
- Visibility
- Temperature
- Precipitation
- Fire distance
- Route length
- Airport characteristics

Output:
- Route disruption probability

Only present the ML model as a scientific result if:
- Labels have a defensible source.
- Train / validation split is documented.
- Accuracy alone is not used as the only metric.
- Data leakage is checked.

---

## 10. Explainability Engine

Do not use an LLM for the first version.

Store the reasons used by the optimizer.

Example decision record:

```json
{
  "aircraft": "AC_07",
  "mission": "MED_02",
  "selected_because": [
    "nearest compatible available aircraft",
    "sufficient runway compatibility",
    "sufficient range",
    "medical priority level 1"
  ],
  "tradeoffs": {
    "passenger_delay_added_min": 41,
    "medical_time_saved_min": 126
  }
}
```

Frontend converts this into:

> NORTHSTAR reassigned Aircraft 07 because it was the nearest available aircraft that met the range and runway requirements. The reassignment increased passenger delay by 41 minutes but reduced the medical response time by 126 minutes.

This is reliable, explainable, and easy to demo.

---

## 11. Metrics Engine

Create one function:

```text
evaluate(simulation_state) -> metrics
```

Return:

```json
{
  "disconnected_communities": 1,
  "disconnected_community_hours": 4.5,
  "medical_response_avg_min": 104,
  "cargo_delay_avg_min": 204,
  "passenger_delay_avg_min": 38,
  "reroutes": 8,
  "distance_flown_km": 8120,
  "recovery_time_min": 420
}
```

Use the exact same evaluation code for the baseline and NORTHSTAR.

This prevents unfair comparisons.

---

## 12. Research Experiment Runner

Create a separate script:

```text
experiments/run_experiments.py
```

Flow:

```text
generate scenario
      |
      +--> clone --> run baseline --> evaluate
      |
      +--> clone --> run NORTHSTAR --> evaluate
      |
      v
save both results
```

Run:
- 100 scenarios for MVP
- 500+ if performance allows

Randomized elements:
- Airport closure
- Aircraft failure
- Weather severity
- Wildfire location
- Medical request
- Cargo request

Use a fixed random seed so experiments can be reproduced.

Example:

```python
random.seed(42)
```

---

## 13. Public Data Integration

The system should separate:

### Static public data
Imported before the demo:
- Airports
- Communities
- Population
- Geographic coordinates

### Optional live / recent public data
Can be added later:
- Weather
- Wildfire / hotspot data

Useful Canadian public sources include:
- Environment and Climate Change Canada / MSC GeoMet
- Natural Resources Canada / Canadian Wildland Fire Information System
- Statistics Canada Census Profile
- Open Government airport / runway datasets

For competition reliability, cache the data locally before the demo.

The application should still work without internet access.

---

## 14. Backend API

### GET /network
Returns the full starting network.

### POST /scenario
Creates / loads a scenario.

### POST /scenario/reset
Resets current simulation.

### POST /baseline/run
Runs baseline strategy.

### POST /optimize
Runs NORTHSTAR optimization.

### GET /scenario/{id}/metrics
Returns current metrics.

### GET /scenario/{id}/decisions
Returns explanation records.

### POST /experiments/run
Runs research experiments.

### GET /experiments/{id}
Returns aggregated experiment results.

Keep the API small.

---

## 15. Frontend Screens

### Screen 1 — Command Center

Main screen:
- Large map
- Current network status
- Aircraft count
- Communities connected
- Alerts
- Disruption creator
- RUN NORTHSTAR button

### Screen 2 — Decision Comparison

Show:
- Baseline
- NORTHSTAR
- Delta / improvement
- Explanation

### Screen 3 — Research Results

Charts:
- Medical response time
- Community disconnected-hours
- Cargo delay
- Passenger delay
- Recovery time

Also show:
- Number of scenarios
- Experiment configuration

### Screen 4 — About / Responsible AI

Explain:
- What is real
- What is synthetic
- What NORTHSTAR can and cannot do

---

## 16. UI Behavior

Recommended visual states:

```text
Normal route       solid line
Changed route      animated / emphasized line
Disrupted route    red / warning state
Normal airport     standard marker
Closed airport     warning marker
Medical mission    medical icon
Cargo mission      cargo icon
Wildfire           fire zone / marker
```

The user should understand what happened without reading a large paragraph.

---

## 17. Development Plan

### Sprint 1 — Core Model
- Create 15–25 airports
- Create communities
- Create 8–12 aircraft
- Create routes
- Build NetworkX graph
- Calculate connectivity

### Sprint 2 — Simulation
- Airport closure
- Aircraft failure
- Medical request
- Cargo request
- Baseline algorithm
- Metrics

### Sprint 3 — Optimization
- OR-Tools model
- Constraints
- Objective function
- Compare baseline vs NORTHSTAR

### Sprint 4 — Frontend
- Map
- Scenario panel
- RUN NORTHSTAR flow
- Before / after results
- Explainability panel

### Sprint 5 — Research
- Random scenario generator
- 100-scenario experiment
- Charts
- Export results

### Sprint 6 — Competition Polish
- Preset demo scenario
- Animation
- Error handling
- Offline cached dataset
- Responsible AI page
- Rehearse 3–5 minute demo

---

## 18. Technical Acceptance Tests

### Scenario
- Closing an airport removes it from valid routing.
- Aircraft failure prevents assignment.
- Multiple disruptions can exist together.

### Optimizer
- Never assigns unavailable aircraft.
- Never uses closed airports.
- Never assigns an aircraft that fails runway/range/capacity constraints.
- Returns "no feasible solution" instead of inventing one.

### Comparison
- Baseline and NORTHSTAR start from identical state.
- Both use the same metric functions.
- Experiment results are reproducible.

### UI
- Map updates after scenario changes.
- Metrics update after each run.
- User can reset without refreshing browser.
- Preset demo works reliably.

---

## 19. What Not to Overbuild

Avoid:
- Flight physics
- Real-time ADS-B integration
- Detailed airline scheduling
- Real medical triage algorithms
- Complex LLM agents
- Live airline operations
- Full Canada-scale network
- Perfect fuel modeling

For WAICY, the strongest version is not the biggest system.

It is the system where:
1. The problem is understandable.
2. The algorithm is real.
3. The experiment is reproducible.
4. The results are measurable.
5. The demo is memorable.

---

## 20. Final Technical Target

A successful MVP should be able to perform this full sequence:

```text
Load Northern network
        ↓
Create wildfire + airport closure + medical emergency
        ↓
Measure baseline impact
        ↓
Run NORTHSTAR optimization
        ↓
Reassign aircraft and routes
        ↓
Explain the decision
        ↓
Compare metrics
        ↓
Show results from 100 repeated experiments
```

If this works cleanly, the project is technically sufficient for a strong competition presentation without unnecessary complexity.
