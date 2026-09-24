# NORTHSTAR AI — Experiment summary

Generated 2026-09-24T04:34:02Z · 100 paired scenarios · master seed 42 · policy `balanced` · commit `003bba7` · OR-Tools 9.15.6755

Every scenario was run once with the rule-based baseline and once with NORTHSTAR from identical initial states, through the same simulator and the same metrics function. Unserved missions are censored at the horizon end (24 h) for both strategies. See `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`.

## Primary comparison

| Metric | Baseline mean (median) | NORTHSTAR mean (median) | Δ mean | Improvement | NORTHSTAR better / baseline better / tie | sign-test p |
|---|---:|---:|---:|---:|:--:|---:|
| Mean medical response time (min) | 155.1 (102.5) | 128.55 (90.0) | -26.55 | +17.1% | 24 / 7 / 69 | 0.00333 |
| Disconnected-community hours (h) | 64.58 (57.25) | 41.88 (35.25) | -22.69 | +35.2% | 88 / 2 / 10 | 6.62e-24 |
| Mean essential-cargo delay past deadline (min) | 112.7 (25.0) | 81.0 (0.0) | -31.7 | +28.1% | 35 / 17 / 48 | 0.0175 |
| Mean passenger flight delay (min) | 198.45 (177.7) | 80.85 (68.1) | -117.61 | +59.3% | 96 / 0 / 4 | 2.52e-29 |
| Network recovery time (min) | 1258.2 (1320.0) | 1112.4 (1110.0) | -145.8 | +11.6% | 60 / 3 / 37 | 9.05e-15 |
| Distance flown (km) | 21208.15 (20781.25) | 17681.73 (17382.1) | -3526.42 | +16.6% | 90 / 5 / 5 | 3.09e-21 |
| Reroutes / reassignments (count) | 1.09 (1.0) | 3.5 (3.0) | 2.41 | -221.1% | 4 / 65 / 31 | 3.11e-15 |
| Communities still disconnected at end of day (communities) | 0.87 (1.0) | 0.08 (0.0) | -0.79 | +90.8% | 54 / 1 / 45 | 3.11e-15 |
| Cancelled scheduled flights (flights) | 2.16 (2.0) | 0.22 (0.0) | -1.94 | +89.8% | 71 / 2 / 27 | 5.72e-19 |
| Critical missions completed (%) | 93.2 (100.0) | 95.95 (100.0) | 2.75 | +3.0% | 10 / 1 / 89 | 0.0117 |

Improvement % is relative to the baseline mean, signed so that positive is better for NORTHSTAR.

## Tradeoffs (metrics where the baseline won more scenarios)

- **Reroutes / reassignments**: baseline better in 65 scenarios, NORTHSTAR in 4, tie in 31.

## Censoring and completeness

- Medical missions: 201 total; unserved within 24 h: baseline 5, NORTHSTAR 3.
- Cargo missions: 195 total; unserved: baseline 22, NORTHSTAR 14.
- Cancelled scheduled flights: baseline 216, NORTHSTAR 22.

## Solver

- CP-SAT calls: 2438; proven optimal: 2284; feasible-not-optimal: 0; time-outs: 0; slowest call 3827 ms; mean NORTHSTAR run 2.12 s per scenario.
- Runs with a status other than OK: 0; assignments rejected by the simulator's feasibility check: 0.

## Sensitivity to the policy profile

| Metric | balanced improvement | medical_first improvement | connectivity_first improvement |
|---|---:|---:|---:|
| Mean medical response time | +17.1% (24/7/69) | +17.6% (25/5/70) | +15.4% (22/9/69) |
| Disconnected-community hours | +35.2% (88/2/10) | +35.2% (88/2/10) | +36.2% (89/1/10) |
| Mean essential-cargo delay past deadline | +28.1% (35/17/48) | +28.1% (35/17/48) | +7.9% (31/25/44) |
| Mean passenger flight delay | +59.3% (96/0/4) | +59.0% (96/0/4) | +59.9% (96/0/4) |
| Network recovery time | +11.6% (60/3/37) | +11.6% (60/3/37) | +11.8% (57/4/39) |
| Distance flown | +16.6% (90/5/5) | +16.8% (90/5/5) | +16.4% (92/4/4) |
| Reroutes / reassignments | -221.1% (4/65/31) | -223.9% (4/66/30) | -244.0% (5/63/32) |
| Communities still disconnected at end of day | +90.8% (54/1/45) | +90.8% (54/1/45) | +87.4% (51/1/48) |
| Cancelled scheduled flights | +89.8% (71/2/27) | +89.4% (71/2/27) | +87.5% (70/2/28) |
| Critical missions completed | +3.0% (10/1/89) | +3.0% (10/1/89) | +2.7% (9/1/90) |

## Do-nothing reference (schedule only, no response)

- Mean medical response time: mean 906.35 min
- Disconnected-community hours: mean 43.2 h
- Mean essential-cargo delay past deadline: mean 639.65 min
- Mean passenger flight delay: mean 81.33 min

## Limitations

Synthetic fleet, schedule and demand; one 28-airport network; deterministic execution; the baseline is one reasonable rule set, not an expert dispatcher. Results do not generalise to real operations. See `docs/RESPONSIBLE_AI.md`.
