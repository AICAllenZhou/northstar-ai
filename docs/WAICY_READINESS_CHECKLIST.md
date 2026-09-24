# NORTHSTAR AI — WAICY Readiness Checklist

Tick an item only with evidence (a test name, a file, a screenshot, or a
rehearsal log). Updated at the end of the overnight sprint (2026-09-24,
branch `waicy-overnight-polish`); the earlier evidence from the first build is
kept where it still holds.

## A. Problem definition (can a judge state the problem in one sentence?)

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | The website states the problem before any control: Northern communities depend on air links that break during disruptions. | `#/` hero and "The human problem" section; `docs/screenshots/home-hero.png`, `hero-coast.png` |
| ☑ | Research question is visible verbatim on the site and the Research page. | `#/` "The question" band; `#/research` head; `docs/screenshots/research-story.png` |
| ☑ | The map makes the network understandable within ~10 seconds (hubs, communities, routes, aircraft, territory). | `docs/screenshots/command-center.png`: coastline, graticule, hub halos and labels, community dots, routes, aircraft icons by role, legend |
| ☑ | Real geography is used and labelled as real; synthetic operations are labelled as synthetic, on every page. | Data page provenance table with REAL / DERIVED / SYNTHETIC badges (`data-page.png`); disclaimer strip in the command centre; `docs/DATA_PROVENANCE.md` |

## B. Where is the AI, and why is it useful here?

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | RUN NORTHSTAR AI is the focal action of the guided demo (step 8) and of the right column. | `docs/screenshots/step-08.png`; `run-moment.png` |
| ☑ | The method is named on screen (constraint optimization, OR-Tools CP-SAT) and the RUN moment names the optimizer's real phases and shows the real solver log. | `run-moment.png`: five phases from `plan()` in `backend/northstar/strategies/northstar.py`, solver log from `replans[]` |
| ☑ | A non-AI baseline exists, is described in one sentence on screen, and in ≤ 7 rules in code. | Demo step 7 caption; `backend/northstar/strategies/baseline.py` docstring; methodology §5.1 |
| ☑ | The decision panel shows every aircraft the optimizer considered, with its verdict and reason. | `docs/screenshots/why-alternatives.png` (10 of 10 aircraft, chosen / busy / worse / rejected / stranded / failed); `test_decision_record_response_fields_are_consistent` |
| ☑ | Policy weight profiles are switchable and change the recommendation. | Advanced mode profile selector; Research "Policy sensitivity"; `tests/test_northstar.py::test_policy_profile_changes_the_recommendation` |
| ☑ | No LLM is used anywhere for decisions or explanations. | `backend/northstar/explain/explain.py` is string templates over solver data; no LLM dependency in `backend/pyproject.toml`; stated on the why-card and the About page |
| ☑ | Cached results are declared as such; nothing waits for show. | Run results carry `cached`, `compute_ms`, `computed_at`; the RUN moment prints "solved at start-up by the same engine (N ms); nothing is recomputed now" and enables *See the result* the instant the response arrives (`RunMoment.tsx`); `test_result_cache_is_transparent_and_identical` |

## C. Measurable, credible results

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | Before/After numbers come from the simulation at run time (no constants). | `GET /api/compare` returns `evaluate(trace)` output; V4 numbers audit maps every Research figure to a `summary.json` field |
| ☑ | 100 paired scenarios, seed 42, results committed as CSV with the commit hash. | `experiments/results/results.csv` (500 rows); `summary.json` `git_commit 5f0d9ab`, `git_dirty false` |
| ☑ | Wins / losses / ties per metric shown for all ten metrics, one tick per scenario, losses visible. | `docs/screenshots/research-strips.png`; "Where NORTHSTAR loses" names the two disconnected-hours losses and the reroute trade-off (65 baseline wins) |
| ☑ | Sign-test p-values shown; no significance claimed below the threshold. | `comparisons[*][*].p_value` / `significant`; the sensitivity sentence states "not significant" where p ≥ 0.05 |
| ☑ | Censored (unserved) mission counts shown next to every average. | `Metrics.medical_unserved`, `cargo_unserved`, `cancelled_flights`; Research "Censoring"; result card shows "not served (1)" |
| ☑ | Every replanning decision is accounted for (four solver buckets that sum to the total). | `summary.md` Solver section; Research "Solver honesty" bar; `tests/test_experiment_summary.py` |
| ☑ | Re-running the experiment reproduces the committed CSV. | 2026-09-24 re-run at 5f0d9ab: 500 runs, 0 trace-hash differences, 0 changed metric cells (commit a8ede20); `--verify` run recorded in `docs/OVERNIGHT_ITERATION_LOG.md` Version 5 |
| ☑ | Any scenario in the experiment can be opened in the simulator and re-run live. | Research "Open in simulator" (`docs/screenshots/research-open-sim.png`); driver asserts the loaded scenario matches `/api/experiments/scenarios/{id}` |

## D. Explainability and Responsible AI

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | Every assignment has a structured reason list derived from data. | `DecisionRecord.reasons[]` (PRIORITY / NEAREST_RANK / RUNWAY_OK / RANGE_OK / MULTI_HOP / ALTERNATE_HUB / …); why-card checklist |
| ☑ | Trade-offs are shown per decision and per scenario in words. | `DecisionRecord.tradeoffs[]`; result card trade-off sentence ("essential cargo arrives 3h30 later than under the baseline") |
| ☑ | Disclaimer text is displayed on every screen. | Amber strip under the command-centre header; hero and footer on the site; text from `GET /api/network.disclaimer` |
| ☑ | Responsible AI covers human-in-the-loop, real vs synthetic data, uncertainty, limitations, explainability, no autonomous control, weight trade-offs, no generalisation guarantee, and what it would take to use for real. | About page (`about-page.png`); `docs/RESPONSIBLE_AI.md` |
| ☑ | NORTHSTAR output is a recommendation; nothing auto-applies. | API only computes on explicit `POST /api/run/northstar`; `docs/RESPONSIBLE_AI.md` §2 |
| ☑ | "NO FEASIBLE SOLUTION" is reachable, displayed, and counted in the experiment. | `tests/test_northstar.py::test_no_feasible_solution_is_explicit`; `tests/test_api.py::test_no_feasible_solution_surfaces`; 154 such decisions reported in the summary |
| ☑ | Community priority weights default to equal; the equity implication of population weighting is discussed. | `communities.csv` priority_weight = 1.0; `docs/RESPONSIBLE_AI.md` §6 |

## E. Demo reliability

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | One command starts everything and says when it is ready. | `scripts/demo.sh` → `scripts/wait_ready.py` prints "ready in N s: 5 presets precomputed"; verified on port 8010 (10 s) |
| ☑ | The first screen after start-up is the healthy network. | Launcher no longer loads a preset into the session (commit 4d26c02); verified `Healthy network (no disruption)` after start |
| ☑ | Works with Wi-Fi off (bundled basemap and fonts, local API, committed results). | Playwright driver flags non-localhost requests: none, every run since V1; fonts bundled from `@fontsource`; basemap from `/api/basemap/*` |
| ☑ | The guided demo walks ten steps with one button per step, building the scenario incrementally. | `DemoStepper` + `demoSteps.ts`; `docs/screenshots/step-01.png` … `step-10.png`; driver wall time 22 s excluding narration |
| ☑ | Primary preset produces a visible NORTHSTAR-vs-baseline difference with an honest trade-off. | kivalliq_wildfire: communities still cut off 3 → 0, disconnected-hours 88.5 → 53, cancelled 8 → 0, cargo delay 2h → 5h30 (trade-off); `step-09.png` |
| ☑ | Backup presets are one menu away inside the demo and produce visible differences. | Demo card scenario menu (Arctic weather, Medical emergency + aircraft failure); preset cards `presets.png` |
| ☑ | Every preset result is precomputed at start-up by the same engine; custom scenarios solve live. | `warmup` in `/api/health`; "Precomputed ✓" chips; V5 preset performance table in the iteration log |
| ☑ | Reset returns to the healthy network without a page refresh. | Reset button → `POST /api/scenario/reset`; driver asserts NORMAL + zero disruptions after open-in-simulator |
| ☑ | Backend-unreachable state shows a clear message; the page reconnects by itself. | `docs/screenshots/backend-down.png`; health polled every 5 s |
| ☑ | Cold start from a fresh clone works (dependencies, build, launcher, driver, tests). | Version 5 entry in `docs/OVERNIGHT_ITERATION_LOG.md` (timings recorded) |
| ☐ | Full run-through rehearsed by the presenter in < 5 minutes at least three times. | To be done by the presenter with `docs/DEMO_SCRIPT.md` and a timer; not something the build can tick |
| ☑ | Screenshots of every demo step and every page saved as a last-resort backup. | `docs/screenshots/` (site, pages, ten steps, run moment, research story, failure states, narrow layouts) |

## F. Engineering quality

| ✓ | Item | Evidence |
|---|------|----------|
| ☑ | All backend tests pass (`uv run pytest`). | 41 tests green on 2026-09-24 (loader, graph, simulation, baseline, metrics, optimizer, API, cache transparency, experiment summary, decision-record consistency) |
| ☑ | Frontend type-checks, builds and lints clean. | `npm run build` (tsc -b && vite build) and `npx oxlint` clean at every sprint commit |
| ☑ | Browser check passes: no external requests, no page errors, no horizontal overflow at 390 / 768 / 1024 / 1280 / 1440 / 1600 px. | `frontend/scripts/demo_screenshots.mjs`, run after every version |
| ☑ | README explains purpose, research question, what you get, architecture, run, experiments, synthetic data, limitations. | `README.md` |
| ☑ | Every dataset has a metadata sidecar and appears in DATA_PROVENANCE.md and on the Data page. | `datasets/processed/*.meta.json`, `datasets/raw/PROVENANCE.json`, `docs/DATA_PROVENANCE.md`, `data-page.png` |
| ☑ | No placeholder code paths; no hard-coded results; no hype words. | grep for TODO/FIXME/placeholder in backend returns nothing; V4 wording sweep over `frontend/src`: zero hits |
| ☑ | Every iteration of the sprint has tests, screenshots, a critique and a commit hash. | `docs/OVERNIGHT_ITERATION_LOG.md` Versions 1–5 |

## G. Pre-demo runbook

**The day before**
1. `git status` clean; `cd backend && uv run pytest` green; `cd frontend && npm run build && npx oxlint` green.
2. `cd backend && uv run python ../experiments/run_experiments.py --verify` → "VERIFY OK".
3. Disable OS updates and sleep; set the display resolution used at the venue (≥ 1440 px wide keeps the demo card docked beside the map; at 1280 it still docks; below that it becomes a bottom overlay).
4. Rehearse `docs/DEMO_SCRIPT.md` with a timer, three times.

**One hour before**
1. Turn Wi-Fi off. Run `scripts/demo.sh`; wait for "ready in N s: 5 presets precomputed".
2. Open http://localhost:8000/ and scroll the landing page once; click **Launch NORTHSTAR**; leave the welcome dialog open (its first button is *Start guided demo*).
3. Leave **Advanced** off.

**If something fails**
| Symptom | Action |
|---------|--------|
| "Backend unreachable" banner | Re-run `scripts/demo.sh`; the page reconnects and the demo resumes. |
| NORTHSTAR shows PARTIAL / time-out | Say so (it is honest); the comparison is still valid. Never seen on the presets. |
| Preset behaves unexpectedly | Switch the demo card's scenario menu to a backup preset; the Research page carries the aggregate story. |
| Browser crash | Re-open the page; state is reloaded from the backend; *Start guided demo* again. |
| Total failure | Walk through `docs/screenshots/step-01.png` … `step-10.png` and `research-story.png` with the same narration. |
