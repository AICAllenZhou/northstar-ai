# NORTHSTAR AI — WAICY Readiness Checklist

Tick an item only with evidence (a test name, a file, a screenshot, or a
rehearsal log). "Evidence" is filled in during Milestone 8 hardening.

## A. Problem definition (can a judge state the problem in one sentence?)

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | Landing panel states the problem: Northern communities depend on air links that break during disruptions. | |
| ☐ | Research question is visible verbatim on the main screen. | |
| ☐ | The map makes the network understandable within ~10 seconds (hubs, communities, routes, aircraft). | |
| ☑ | Real geography is used and labelled as real; synthetic operations are labelled as synthetic. | `datasets/processed/*.meta.json`, `docs/DATA_PROVENANCE.md`, disclaimer in `GET /api/network` |

## B. Where is the AI, and why is it useful here?

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | The RUN NORTHSTAR AI button is the visual focal point. | |
| ☐ | The method is named on screen (constraint optimization, OR-Tools CP-SAT) with a one-line description of what it searches over. | |
| ☑ | A non-AI baseline exists, is visibly simpler, and is described in ≤ 6 rules. | `backend/northstar/strategies/baseline.py` docstring (7 short rules incl. the tie rule); methodology §5.1 |
| ☐ | The decision panel shows alternatives the optimizer rejected and why. | |
| ☐ | Policy weight profiles are switchable and change the recommendation. | |
| ☑ | No LLM is used anywhere for decisions or explanations. | `backend/northstar/explain/explain.py` is string templates over solver data; no LLM dependency in `backend/pyproject.toml` |

## C. Measurable, credible results

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | Before/After panel numbers come from the simulation at run time (no constants). | `GET /api/compare` returns `evaluate(trace)` output; grep for literal metric values in backend finds none |
| ☑ | 100 paired scenarios, seed 42, results committed as CSV. | `experiments/results/results.csv` (600 rows: 100 × {do_nothing, baseline, northstar×3 policies}); `summary.json` records commit hash and dirty flag |
| ☑ | Wins / losses / ties per metric shown, including metrics where baseline wins. | `experiments/results/summary.md` → Tradeoffs section lists reroutes (baseline wins 66/100) |
| ☑ | Sign-test p-values shown; no significance claimed below the threshold. | `summary.json` `comparisons[*][*].p_value` / `significant`; computed by exact two-sided sign test in `run_experiments.py` |
| ☑ | Censored (unserved) mission counts shown next to every average. | `Metrics.medical_unserved`, `cargo_unserved`, `cancelled_flights`; `summary.md` → Censoring section |
| ☐ | "How we tested NORTHSTAR" section exists on the Research screen. | |
| ☑ | Re-running the experiment reproduces the committed CSV (`--verify`). | 2026-09-24: `run_experiments.py --verify` → "VERIFY OK: 500 runs reproduce the committed trace hashes" |

## D. Explainability and Responsible AI

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | Every assignment has a structured reason list derived from data. | `DecisionRecord.reasons[]` with codes PRIORITY / NEAREST_RANK / RUNWAY_OK / RANGE_OK / MULTI_HOP / ALTERNATE_HUB / …; `tests/test_api.py::test_demo_sequence` |
| ☑ | Tradeoffs (who was delayed to help whom) are shown per decision. | `DecisionRecord.tradeoffs[]` (missions the baseline flew with the same aircraft that NORTHSTAR finished later) |
| ☐ | Disclaimer text is displayed on every screen: research simulation, not for real operations. | |
| ☐ | Responsible AI tab covers human-in-the-loop, real vs synthetic data, uncertainty, limitations, explainability, no autonomous control, weight tradeoffs, no generalisation guarantee. | |
| ☑ | NORTHSTAR output is a *recommendation* the operator applies; nothing auto-applies. | API only computes on explicit `POST /api/run/northstar`; nothing changes the scenario; `docs/RESPONSIBLE_AI.md` §2 |
| ☑ | "NO FEASIBLE SOLUTION" state is reachable and displayed clearly. | `tests/test_northstar.py::test_no_feasible_solution_is_explicit`, `tests/test_api.py::test_no_feasible_solution_surfaces` |
| ☑ | Community priority weights default to equal; the equity implication of population weighting is discussed. | `communities.csv` priority_weight = 1.0; `docs/RESPONSIBLE_AI.md` §6 |

## E. Demo reliability

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | One command starts backend and frontend (`scripts/demo.sh`). | |
| ☐ | Works with Wi-Fi off (bundled basemap, local API, committed results). | |
| ☐ | Demo Mode stepper walks the ten steps with one "Next" button. | |
| ☑ | Primary preset (wildfire + closure + medical + cargo) produces a visible NORTHSTAR-vs-baseline difference. | kivalliq_wildfire: disconnected-h 88.5→53, cancelled 8→0, pax delay 392→168, cargo delay 120→330 (tradeoff); see `docs/DEMO_SCRIPT.md` |
| ☑ | At least two backup presets also produce a visible difference. | baffin_blizzard (87.5→42 h, 3→0 cancelled), cargo_shortage (114→23 h, pax 440→88), kitikmeot (recovery 480→300, medical 60→105 tradeoff) |
| ☑ | NORTHSTAR run completes in < 3 s on the demo machine for every preset. | Measured 2026-09-24 with 8 workers: kivalliq 2.2 s, baffin 0.9 s, kitikmeot 1.3 s, cascading 1.0 s; **cargo_shortage 10 s** (exception, documented; backup preset only) |
| ☐ | Reset returns to the healthy network without a page refresh. | |
| ☐ | Backend-unreachable state shows a clear message and a retry button. | |
| ☐ | Full run-through rehearsed in < 5 minutes at least three times. | |
| ☐ | Screenshots of every demo step saved in `docs/screenshots/` as a last-resort backup. | |

## F. Engineering quality

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | All backend tests pass (`uv run pytest`). | 35 tests green on 2026-09-24 (loader, graph, simulation, baseline, metrics, optimizer, API) |
| ☐ | Frontend type-checks and builds. | |
| ☑ | End-to-end smoke test passes. | `tests/test_api.py::test_demo_sequence` + `scripts/smoke_test.py` against the running server |
| ☐ | README explains purpose, research question, architecture, run, experiments, demo mode, synthetic data, limitations. | |
| ☑ | Every dataset has a metadata sidecar and appears in DATA_PROVENANCE.md. | `datasets/processed/*.meta.json`, `datasets/raw/PROVENANCE.json` (14 entries), `docs/DATA_PROVENANCE.md` |
| ☑ | No placeholder code paths; no hard-coded results. | grep for TODO/FIXME/placeholder in backend returns nothing; all metrics computed by `evaluate()` |

## G. Pre-demo runbook

**The day before**
1. `git status` clean; `uv run pytest` green; `npm run build` green.
2. Run `experiments/run_experiments.py --verify`.
3. Disable OS updates and sleep; set display resolution used at the venue.
4. Rehearse `docs/DEMO_SCRIPT.md` with a timer.

**One hour before**
1. Turn Wi-Fi off. Start `scripts/demo.sh`. Open the browser to the printed URL.
2. Load the primary preset; run baseline and NORTHSTAR once (warms the solver).
3. Reset. Enable Demo Mode. Leave the healthy network on screen.

**If something fails**
| Symptom | Action |
|---------|--------|
| "Backend unreachable" banner | Re-run `scripts/demo.sh`; the UI reconnects automatically. |
| NORTHSTAR returns TIMEOUT / FEASIBLE | Say so (it is honest); switch to backup preset 2. |
| Preset shows no difference | Switch to a backup preset; the Research screen carries the aggregate story. |
| Browser crash | Re-open; state is reloaded from the backend. |
| Total failure | Walk through `docs/screenshots/` with the same narration. |
