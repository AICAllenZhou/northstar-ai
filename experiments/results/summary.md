# NORTHSTAR AI — Experiment summary

Generated 2026-09-24T04:24:41Z · 100 paired scenarios · master seed 42 · policy `balanced` · commit `654aa61` · OR-Tools 9.15.6755

Every scenario was run once with the rule-based baseline and once with NORTHSTAR from identical initial states, through the same simulator and the same metrics function. Unserved missions are censored at the horizon end (24 h) for both strategies. See `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`.

## Primary comparison

| Metric | Baseline mean (median) | NORTHSTAR mean (median) | Δ mean | Improvement | NORTHSTAR better / baseline better / tie | sign-test p |
|---|---:|---:|---:|---:|:--:|---:|
| Mean medical response time (min) | 169.55 (110.0) | 129.1 (90.0) | -40.45 | +23.9% | 31 / 8 / 61 | 0.000294 |
| Disconnected-community hours (h) | 78.8 (71.25) | 41.95 (36.0) | -36.84 | +46.8% | 92 / 1 / 7 | 1.9e-26 |
| Mean essential-cargo delay past deadline (min) | 117.0 (30.0) | 81.6 (0.0) | -35.4 | +30.3% | 35 / 17 / 48 | 0.0175 |
| Mean passenger flight delay (min) | 297.85 (293.1) | 81.56 (68.1) | -216.28 | +72.6% | 97 / 0 / 3 | 1.26e-29 |
| Network recovery time (min) | 1307.1 (1350.0) | 1113.0 (1110.0) | -194.1 | +14.8% | 69 / 2 / 29 | 2.17e-18 |
| Distance flown (km) | 26870.02 (27209.75) | 17720.52 (17521.75) | -9149.51 | +34.1% | 98 / 0 / 2 | 6.31e-30 |
| Reroutes / reassignments (count) | 5.86 (6.0) | 3.67 (3.0) | -2.19 | +37.4% | 66 / 18 / 16 | 1.33e-07 |
| Communities still disconnected at end of day (communities) | 1.31 (1.0) | 0.08 (0.0) | -1.23 | +93.9% | 75 / 1 / 24 | 2.04e-21 |
| Cancelled scheduled flights (flights) | 3.62 (3.0) | 0.23 (0.0) | -3.39 | +93.6% | 82 / 1 / 17 | 1.74e-23 |
| Critical missions completed (%) | 91.83 (100.0) | 95.62 (100.0) | 3.78 | +4.1% | 13 / 1 / 86 | 0.00183 |

Improvement % is relative to the baseline mean, signed so that positive is better for NORTHSTAR.

## Tradeoffs (metrics where the baseline won more scenarios)

- None.

## Censoring and completeness

- Medical missions: 201 total; unserved within 24 h: baseline 11, NORTHSTAR 3.
- Cargo missions: 195 total; unserved: baseline 21, NORTHSTAR 15.
- Cancelled scheduled flights: baseline 362, NORTHSTAR 23.

## Solver

- CP-SAT calls: 2450; proven optimal: 2296; feasible-not-optimal: 0; time-outs: 0; slowest call 6288 ms; mean NORTHSTAR run 3.88 s per scenario.
- Runs with a status other than OK: 0; assignments rejected by the simulator's feasibility check: 9.

## Sensitivity to the policy profile

| Metric | balanced improvement | medical_first improvement | connectivity_first improvement |
|---|---:|---:|---:|
| Mean medical response time | +23.9% (31/8/61) | +24.4% (31/6/63) | +22.1% (28/9/63) |
| Disconnected-community hours | +46.8% (92/1/7) | +46.8% (92/1/7) | +47.4% (92/1/7) |
| Mean essential-cargo delay past deadline | +30.3% (35/17/48) | +30.3% (35/17/48) | +11.1% (31/25/44) |
| Mean passenger flight delay | +72.6% (97/0/3) | +72.5% (97/0/3) | +72.9% (97/0/3) |
| Network recovery time | +14.8% (69/2/29) | +14.8% (69/2/29) | +15.1% (66/2/32) |
| Distance flown | +34.1% (98/0/2) | +34.2% (98/0/2) | +33.7% (99/0/1) |
| Reroutes / reassignments | +37.4% (66/18/16) | +36.9% (65/18/17) | +29.7% (61/24/15) |
| Communities still disconnected at end of day | +93.9% (75/1/24) | +93.9% (75/1/24) | +91.6% (73/1/26) |
| Cancelled scheduled flights | +93.6% (82/1/17) | +93.4% (82/1/17) | +92.0% (82/2/16) |
| Critical missions completed | +4.1% (13/1/86) | +4.1% (13/1/86) | +3.9% (13/2/85) |

## Do-nothing reference (schedule only, no response)

- Mean medical response time: mean 906.35 min
- Disconnected-community hours: mean 43.2 h
- Mean essential-cargo delay past deadline: mean 639.65 min
- Mean passenger flight delay: mean 81.33 min

## Limitations

Synthetic fleet, schedule and demand; one 28-airport network; deterministic execution; the baseline is one reasonable rule set, not an expert dispatcher. Results do not generalise to real operations. See `docs/RESPONSIBLE_AI.md`.
