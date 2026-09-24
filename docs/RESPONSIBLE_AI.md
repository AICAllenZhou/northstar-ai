# NORTHSTAR AI — Responsible AI Statement

> NORTHSTAR AI is a research simulation and decision-support prototype. It is
> not approved for real-world flight operations, medical decisions, or aviation
> dispatch.

This statement is shown inside the application and is repeated here in full.

## 1. What NORTHSTAR is, and is not

NORTHSTAR is a student research project that asks whether constraint-based
optimization can improve the resilience of a remote aviation network during
disruptions, measured against a simple rule-based dispatch policy, inside a
simulation. It recommends aircraft-to-mission assignments in that simulation.
It does not communicate with any aircraft, airline, hospital, dispatcher or
air-traffic system, and nothing it produces should be used to make a
real-world decision.

## 2. Human in the loop

- NORTHSTAR produces a *recommended plan*. In the interface the operator runs
  it explicitly and can inspect every assignment, the alternatives that were
  rejected and the trade-offs before treating it as anything more than a
  suggestion. Nothing is applied automatically.
- Every recommendation carries structured reasons. The reasons are computed
  from the data the optimizer saw (feasibility table, chosen values, executed
  results). No language model writes or embellishes them.
- The policy weights that define "better" are visible and switchable. There is
  no hidden objective. Different priorities (medical-first, connectivity-
  first, cost-conscious) produce different recommendations, and the project
  does not claim any one of them is correct.

## 3. Real versus synthetic data

Real, from public sources with recorded provenance: airport identities,
coordinates and runways (OurAirports), 2021 community populations (Statistics
Canada) and the basemap (Natural Earth). Synthetic, declared as such: the
fleet, its bases and availability, the route list, the daily schedule,
passenger and cargo demand, medical emergencies, closures, weather and
wildfire events, and the operating-cost index. Two runway lengths come from a
secondary source and are flagged. Details: `docs/DATA_PROVENANCE.md`.
Synthetic operational data is never presented as real Canadian aviation data.

## 4. Uncertainty and limitations

- The simulation is deterministic. Real operations are not: weather changes,
  aircraft break, patients deteriorate, crews time out. A plan that is optimal
  under certainty may be brittle under uncertainty.
- Simplifications: no crew duty limits, no fuel planning beyond range, no
  forecasts, no airport capacity, no night or icing restrictions, no
  maintenance, 30-minute time steps, great-circle distances, fixed turnaround.
- The network has 28 airports and 10 aircraft. Nothing in the results shows
  that they would hold for a larger network, a different region, or a real
  airline.
- The baseline is one reasonable rule set, not an experienced dispatcher.
  The measured gap is a gap to that rule set.
- The optimizer optimizes the same quantities the metrics measure. The
  policy-sensitivity runs and the per-metric win/loss counts exist to make
  that visible rather than to hide it.
- Unserved missions are censored at the end of the 24-hour horizon in every
  average, for both strategies, and the number of censored missions is shown
  next to each average. This understates how bad an unserved medevac is.

## 5. Trade-offs are real and are reported

Optimizing for one goal costs another. In the primary demo scenario NORTHSTAR
restores air service to more communities and cancels fewer flights than the
baseline, and delivers one essential cargo load later than the baseline did.
The experiment summary lists every metric on which the baseline won more
scenarios than NORTHSTAR. Negative results are not removed.

## 6. Equity considerations

- Communities are weighted equally by default. Weighting by population would
  systematically deprioritize the smallest, most isolated communities, which
  are often the ones most dependent on air links. The weight column exists so
  that this choice can be discussed and changed deliberately, not silently.
- Medical missions are ordered by clinical priority (1–3), which in the
  simulation is an input, not something the system infers about a person.
- No personal data of any kind is used or generated.

## 7. No autonomous real-world control

The software has no interface to any real system and none is planned. The
architecture keeps the simulator, the optimizer and the user interface local
to one machine and offline.

## 8. Explicit failure states

When no feasible plan exists (for example every airport is closed, or no
aircraft can reach a community), the system says "NO FEASIBLE SOLUTION" and
lists the reason per mission. When the solver reaches its time limit without
proving optimality, the result is labelled as such. The system never invents
an answer to fill a gap.

## 9. What would be needed before any operational use

Validated operational data, weather and forecast integration, uncertainty-
aware planning, crew and maintenance constraints, regulatory review, and
evaluation with the dispatchers, medical staff and communities who would be
affected. None of this is part of the project.
