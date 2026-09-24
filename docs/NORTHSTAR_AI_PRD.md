# NORTHSTAR AI — Product Requirements Document (PRD)
## AI-Powered Air Connectivity & Resilience Simulator for Northern Canada

**Version:** MVP 1.0  
**Primary Goal:** Build a competition-ready research prototype for WAICY that demonstrates how AI-assisted optimization can help maintain essential air connectivity during disruptions in Northern Canada.

---

## 1. Product Vision

NORTHSTAR AI is an interactive simulation platform that models a simplified Northern Canadian aviation network and allows users to create disruptions such as wildfires, airport closures, severe weather, aircraft failures, cargo shortages, and medical emergencies.

The system then generates a proposed response by reallocating aircraft and rerouting flights while balancing emergency needs, community connectivity, cargo delivery, delays, and operational constraints.

The product is **not** intended to control real aircraft. It is a research and decision-support simulation designed to answer one question:

> Can AI-assisted optimization improve the resilience of remote and Northern aviation networks during major disruptions?

---

## 2. Target Users

### Primary
- WAICY judges
- Student researchers
- Teachers and mentors
- Researchers interested in transportation resilience

### Secondary
- Emergency-planning organizations
- Northern infrastructure researchers
- Aviation planning teams

For the MVP, the product should be designed primarily for a **3–5 minute live competition demo**.

---

## 3. Core Product Experience

The user opens NORTHSTAR AI and sees a command-center style map of a simplified Northern Canadian aviation network.

The interface displays:
- Remote communities
- Airports / airstrips
- Aircraft
- Scheduled or available routes
- Medical hubs
- Cargo hubs
- Weather / wildfire risk
- Network status

The user can create one or more disruptions.

Example:

**Disruptions**
- Airport A closed by wildfire
- Aircraft 03 unavailable
- Community B requires medical evacuation
- Community C requires essential cargo

The system first shows the impact **before optimization**.

Example:
- 6 communities affected
- Medical response ETA: 258 minutes
- 9.1 hours of essential cargo delay
- 14 flights affected

The user then presses:

> **RUN NORTHSTAR AI**

The system calculates a new response and animates the updated network.

Example:
- Aircraft 07 reassigned
- Medical flight prioritized
- Cargo rerouted through alternate hub
- Passenger flight delayed by 41 minutes
- 5 of 6 disconnected communities restored

The interface then compares the baseline response with the NORTHSTAR AI response.

---

## 4. MVP Feature Requirements

### F1. Interactive Aviation Map — Must Have

The map should show approximately:
- 15–25 airports / airstrips
- 20–30 communities
- 8–12 aircraft
- Key routes between locations

Users should be able to click:
- Airport
- Community
- Aircraft
- Route

Each item opens a small information panel.

**Acceptance criteria**
- All network nodes load correctly.
- Routes are visually distinguishable.
- Closed / disrupted nodes are visibly different.
- Replanned routes update after optimization.

---

### F2. Disruption Creator — Must Have

Users can create one or multiple disruptions:

1. Wildfire
2. Severe weather
3. Airport closure
4. Aircraft failure
5. Medical emergency
6. Essential cargo request

Each disruption should modify the simulation state.

**Acceptance criteria**
- At least 3 disruption types can occur simultaneously.
- The network metrics update immediately.
- Users can reset the scenario.

---

### F3. Baseline Response — Must Have

Before NORTHSTAR AI runs, the system must calculate a simple non-AI / rule-based response.

Example baseline rules:
- Use nearest available aircraft.
- Use shortest valid route.
- Prioritize medical missions.
- If no aircraft is available, place request in queue.

The baseline is essential because it gives the project something measurable to compare against.

---

### F4. NORTHSTAR Optimization Engine — Must Have

The optimization engine should determine:
- Which aircraft should serve which mission
- Which routes should be changed
- Which missions should be prioritized
- Which lower-priority flights may be delayed

The optimization should consider:

**Aircraft**
- Current location
- Availability
- Range
- Capacity
- Approximate fuel cost
- Runway compatibility

**Airport**
- Open / closed status
- Runway requirement
- Weather risk
- Wildfire proximity

**Mission**
- Medical priority
- Cargo priority
- Passenger demand
- Time sensitivity

The optimization objective should minimize the combined cost of:
- Disconnected communities
- Medical response time
- Essential cargo delay
- Passenger delay
- Fuel consumption
- Unnecessary rerouting

---

### F5. Before vs. After Comparison — Must Have

After optimization, display a comparison.

Example:

| Metric | Baseline | NORTHSTAR AI |
|---|---:|---:|
| Disconnected communities | 6 | 1 |
| Medical response time | 258 min | 104 min |
| Essential cargo delay | 9.1 h | 3.4 h |
| Flights rerouted | 14 | 8 |

All final competition numbers must come from the actual simulation.

---

### F6. Explainable Decisions — Must Have

Every major recommendation should include a short explanation.

Example:

> Aircraft 07 was reassigned because it was the closest available aircraft capable of using Community B's runway. This increased a passenger delay by 41 minutes but reduced the medical response time by 126 minutes.

The explanation does not need a large language model.

It can be generated from structured decision data.

---

### F7. Scenario Library — Should Have

Include 4–6 preset scenarios:

1. Wildfire Airport Closure
2. Severe Arctic Weather
3. Medical Emergency + Aircraft Failure
4. Multi-Community Cargo Shortage
5. Cascading Network Failure
6. Custom Scenario

This makes the live demo reliable.

---

### F8. Research / Experiment Mode — Must Have

The system should automatically run a batch of simulated disruption scenarios.

Recommended MVP:
- 100 scenarios
- Same starting conditions
- Baseline strategy vs NORTHSTAR strategy

Output:
- Average medical response time
- Community disconnected-hours
- Essential cargo delay
- Passenger delay
- Number of reroutes
- Approximate fuel usage
- Network recovery time

This becomes the strongest evidence for the final WAICY presentation.

---

## 5. Optional ML Risk Model

The MVP does **not** require a heavy machine-learning model.

The core intelligence can be the optimization engine.

If time permits, add a lightweight route-risk model that estimates a risk score using:
- Wind
- Visibility
- Temperature
- Precipitation
- Wildfire distance
- Airport condition
- Route distance

Recommended models:
- Random Forest
- XGBoost

Only include this model in the final presentation if the training labels and evaluation methodology are defensible.

Otherwise, use a transparent rules-based risk score and focus the project on optimization and simulation.

---

## 6. Data Strategy

Use real public data wherever practical, but do not block the project waiting for perfect aviation operations data.

### Real data should ideally include:
- Airport locations
- Community locations
- Population
- Weather
- Wildfire locations / fire conditions

Potential Canadian public sources:
- Environment and Climate Change Canada / MSC GeoMet
- Natural Resources Canada / Canadian Wildland Fire Information System
- Statistics Canada Census Profile
- Federal / provincial Open Government airport and runway datasets

### Synthetic data may be used for:
- Aircraft fleets
- Aircraft availability
- Flight schedules
- Cargo demand
- Passenger demand
- Medical requests
- Airline operating cost
- Operational airport closures

Every synthetic field should be clearly labeled.

---

## 7. Core Metrics

The project should measure:

### Resilience
- Number of disconnected communities
- Total disconnected-community hours
- Network recovery time

### Emergency response
- Medical response time
- Percentage of medical missions completed within target time

### Logistics
- Essential cargo delay
- Cargo delivery completion rate

### Passenger impact
- Passenger delay
- Cancelled simulated flights

### Operational impact
- Number of reroutes
- Aircraft utilization
- Approximate fuel use / distance flown

---

## 8. Research Experiment

### Hypothesis

NORTHSTAR AI can reduce the negative effects of aviation disruptions compared with a simple fixed-rule response.

### Experiment

Run the same 100 scenarios through:

**Strategy A — Baseline**
Rule-based dispatch.

**Strategy B — NORTHSTAR**
Multi-objective optimization.

Compare both strategies using identical scenarios and initial conditions.

### Important

Do not decide the final result before running the experiment.

If NORTHSTAR performs worse on certain metrics, show that honestly and explain the trade-off.

Example:
- Medical response improves
- Passenger delay increases slightly

That is a stronger research story than claiming the AI always wins.

---

## 9. Responsible AI Requirements

The interface must display:

> NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for flight operations, medical decisions, or real-world aviation dispatch.

The project should:
- Keep humans in the decision loop.
- Identify real vs synthetic data.
- Explain major recommendations.
- Show when no feasible solution exists.
- Avoid claiming real operational safety.
- Avoid presenting simulated outcomes as real-world performance.

---

## 10. Out of Scope for MVP

Do NOT spend development time on:
- Real airline integrations
- Real aircraft tracking
- Real air traffic control
- Full Canadian aviation network
- Flight booking
- Real medical dispatch
- Multi-agent LLM systems
- Voice agents
- Complex RAG systems
- Full digital-twin physics
- Accurate airline economics

These features do not materially improve the WAICY demonstration.

---

## 11. Suggested Demo Flow

### 0:00–0:30 — Problem
Introduce Northern communities' dependence on aviation.

### 0:30–1:00 — Normal network
Show communities, aircraft, routes, and current metrics.

### 1:00–1:30 — Create disruption
Close an airport because of wildfire and trigger a medical emergency.

### 1:30–2:15 — Show baseline impact
Explain the disconnected communities and response delay.

### 2:15–3:00 — Run NORTHSTAR AI
Animate rerouting and aircraft reassignment.

### 3:00–3:40 — Explain one decision
Show why a specific aircraft and route were selected.

### 3:40–4:30 — Research results
Show results from 100 simulated scenarios.

### 4:30–5:00 — Responsible AI + conclusion
Explain that the system supports human decision-making rather than replacing aviation professionals.

---

## 12. MVP Definition of Done

The project is competition-ready when:

- A user can open the map and understand the network.
- At least 3 disruptions can happen simultaneously.
- The baseline strategy produces measurable results.
- NORTHSTAR produces a different optimized response.
- The system explains at least one recommendation.
- Before / after metrics are visible.
- At least 100 scenarios can be evaluated automatically.
- Experiment results can be exported or displayed.
- The project clearly labels synthetic data.
- A reliable 3–5 minute live demo is possible.

---

## 13. Recommended Development Priority

### P0 — Build First
1. Static network dataset
2. Map visualization
3. Scenario state
4. Baseline algorithm
5. OR-Tools optimization
6. Before / after metrics
7. Preset wildfire + medical scenario

### P1 — Competition Strength
8. Batch experiment mode
9. Explainability panel
10. Multiple simultaneous disruptions
11. Polished dashboard / animation

### P2 — Only If Time Remains
12. ML risk model
13. Live public weather layer
14. Live public wildfire layer
15. Scenario editor
