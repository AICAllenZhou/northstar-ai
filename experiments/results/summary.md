# NORTHSTAR AI — Experiment summary

Generated 2026-09-24T04:29:35Z · 100 paired scenarios · master seed 42 · policy `balanced` · commit `a3322ac` · OR-Tools 9.15.6755

Every scenario was run once with the rule-based baseline and once with NORTHSTAR from identical initial states, through the same simulator and the same metrics function. Unserved missions are censored at the horizon end (24 h) for both strategies. See `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`.

## Primary comparison

| Metric | Baseline mean (median) | NORTHSTAR mean (median) | Δ mean | Improvement | NORTHSTAR better / baseline better / tie | sign-test p |
|---|---:|---:|---:|---:|:--:|---:|
| Mean medical response time (min) | 155.1 (102.5) | 129.1 (90.0) | -26.0 | +16.8% | 24 / 9 / 67 | 0.0135 |
| Disconnected-community hours (h) | 64.58 (57.25) | 41.95 (36.0) | -22.62 | +35.0% | 88 / 2 / 10 | 6.62e-24 |
| Mean essential-cargo delay past deadline (min) | 112.7 (25.0) | 81.6 (0.0) | -31.1 | +27.6% | 34 / 17 / 49 | 0.0241 |
| Mean passenger flight delay (min) | 198.45 (177.7) | 81.56 (68.1) | -116.89 | +58.9% | 96 / 0 / 4 | 2.52e-29 |
| Network recovery time (min) | 1258.2 (1320.0) | 1113.0 (1110.0) | -145.2 | +11.5% | 60 / 3 / 37 | 9.05e-15 |
| Distance flown (km) | 21208.15 (20781.25) | 17720.52 (17521.75) | -3487.64 | +16.4% | 89 / 6 / 5 | 4.7e-20 |
| Reroutes / reassignments (count) | 1.09 (1.0) | 3.67 (3.0) | 2.58 | -236.7% | 4 / 66 / 30 | 1.65e-15 |
| Communities still disconnected at end of day (communities) | 0.87 (1.0) | 0.08 (0.0) | -0.79 | +90.8% | 54 / 1 / 45 | 3.11e-15 |
| Cancelled scheduled flights (flights) | 2.16 (2.0) | 0.23 (0.0) | -1.93 | +89.4% | 71 / 2 / 27 | 5.72e-19 |
| Critical missions completed (%) | 93.2 (100.0) | 95.62 (100.0) | 2.42 | +2.6% | 9 / 1 / 90 | 0.0215 |

Improvement % is relative to the baseline mean, signed so that positive is better for NORTHSTAR.

## Tradeoffs (metrics where the baseline won more scenarios)

- **Reroutes / reassignments**: baseline better in 66 scenarios, NORTHSTAR in 4, tie in 30.

## Censoring and completeness

- Medical missions: 201 total; unserved within 24 h: baseline 5, NORTHSTAR 3.
- Cargo missions: 195 total; unserved: baseline 22, NORTHSTAR 15.
- Cancelled scheduled flights: baseline 216, NORTHSTAR 23.

## Solver

- CP-SAT calls: 2450; proven optimal: 2296; feasible-not-optimal: 0; time-outs: 0; slowest call 5396 ms; mean NORTHSTAR run 2.13 s per scenario.
- Runs with a status other than OK: 0; assignments rejected by the simulator's feasibility check: 15.

## Sensitivity to the policy profile

| Metric | balanced improvement | medical_first improvement | connectivity_first improvement |
|---|---:|---:|---:|
| Mean medical response time | +16.8% (24/9/67) | +17.3% (25/7/68) | +14.9% (22/11/67) |
| Disconnected-community hours | +35.0% (88/2/10) | +35.0% (88/2/10) | +35.9% (89/1/10) |
| Mean essential-cargo delay past deadline | +27.6% (34/17/49) | +27.6% (34/17/49) | +7.7% (30/25/45) |
| Mean passenger flight delay | +58.9% (96/0/4) | +58.7% (96/0/4) | +59.3% (96/0/4) |
| Network recovery time | +11.5% (60/3/37) | +11.5% (60/3/37) | +11.8% (56/5/39) |
| Distance flown | +16.4% (89/6/5) | +16.6% (89/6/5) | +16.0% (92/4/4) |
| Reroutes / reassignments | -236.7% (4/66/30) | -239.4% (4/67/29) | -278.0% (5/64/31) |
| Communities still disconnected at end of day | +90.8% (54/1/45) | +90.8% (54/1/45) | +87.4% (51/1/48) |
| Cancelled scheduled flights | +89.4% (71/2/27) | +88.9% (71/2/27) | +86.6% (70/2/28) |
| Critical missions completed | +2.6% (9/1/90) | +2.6% (9/1/90) | +2.4% (8/1/91) |

## Do-nothing reference (schedule only, no response)

- Mean medical response time: mean 906.35 min
- Disconnected-community hours: mean 43.2 h
- Mean essential-cargo delay past deadline: mean 639.65 min
- Mean passenger flight delay: mean 81.33 min

## Limitations

Synthetic fleet, schedule and demand; one 28-airport network; deterministic execution; the baseline is one reasonable rule set, not an expert dispatcher. Results do not generalise to real operations. See `docs/RESPONSIBLE_AI.md`.
