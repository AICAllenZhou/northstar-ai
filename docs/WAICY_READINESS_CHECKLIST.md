# NORTHSTAR AI — WAICY Readiness Checklist

Tick an item only with evidence (a test name, a file, a screenshot, or a
rehearsal log). "Evidence" is filled in during Milestone 8 hardening.

## A. Problem definition (can a judge state the problem in one sentence?)

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | Landing panel states the problem: Northern communities depend on air links that break during disruptions. | |
| ☐ | Research question is visible verbatim on the main screen. | |
| ☐ | The map makes the network understandable within ~10 seconds (hubs, communities, routes, aircraft). | |
| ☐ | Real geography is used and labelled as real; synthetic operations are labelled as synthetic. | |

## B. Where is the AI, and why is it useful here?

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | The RUN NORTHSTAR AI button is the visual focal point. | |
| ☐ | The method is named on screen (constraint optimization, OR-Tools CP-SAT) with a one-line description of what it searches over. | |
| ☐ | A non-AI baseline exists, is visibly simpler, and is described in ≤ 6 rules. | |
| ☐ | The decision panel shows alternatives the optimizer rejected and why. | |
| ☐ | Policy weight profiles are switchable and change the recommendation. | |
| ☐ | No LLM is used anywhere for decisions or explanations. | |

## C. Measurable, credible results

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | Before/After panel numbers come from the simulation at run time (no constants). | |
| ☐ | 100 paired scenarios, seed 42, results committed as CSV. | |
| ☐ | Wins / losses / ties per metric shown, including metrics where baseline wins. | |
| ☐ | Sign-test p-values shown; no significance claimed below the threshold. | |
| ☐ | Censored (unserved) mission counts shown next to every average. | |
| ☐ | "How we tested NORTHSTAR" section exists on the Research screen. | |
| ☐ | Re-running the experiment reproduces the committed CSV (`--verify`). | |

## D. Explainability and Responsible AI

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | Every assignment has a structured reason list derived from data. | |
| ☐ | Tradeoffs (who was delayed to help whom) are shown per decision. | |
| ☐ | Disclaimer text is displayed on every screen: research simulation, not for real operations. | |
| ☐ | Responsible AI tab covers human-in-the-loop, real vs synthetic data, uncertainty, limitations, explainability, no autonomous control, weight tradeoffs, no generalisation guarantee. | |
| ☐ | NORTHSTAR output is a *recommendation* the operator applies; nothing auto-applies. | |
| ☐ | "NO FEASIBLE SOLUTION" state is reachable and displayed clearly. | |
| ☐ | Community priority weights default to equal; the equity implication of population weighting is discussed. | |

## E. Demo reliability

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | One command starts backend and frontend (`scripts/demo.sh`). | |
| ☐ | Works with Wi-Fi off (bundled basemap, local API, committed results). | |
| ☐ | Demo Mode stepper walks the ten steps with one "Next" button. | |
| ☐ | Primary preset (wildfire + closure + medical + cargo) produces a visible NORTHSTAR-vs-baseline difference. | |
| ☐ | At least two backup presets also produce a visible difference. | |
| ☐ | NORTHSTAR run completes in < 3 s on the demo machine for every preset. | |
| ☐ | Reset returns to the healthy network without a page refresh. | |
| ☐ | Backend-unreachable state shows a clear message and a retry button. | |
| ☐ | Full run-through rehearsed in < 5 minutes at least three times. | |
| ☐ | Screenshots of every demo step saved in `docs/screenshots/` as a last-resort backup. | |

## F. Engineering quality

| ✓ | Item | Evidence |
|---|------|----------|
| ☐ | All backend tests pass (`uv run pytest`). | |
| ☐ | Frontend type-checks and builds. | |
| ☐ | End-to-end smoke test passes. | |
| ☐ | README explains purpose, research question, architecture, run, experiments, demo mode, synthetic data, limitations. | |
| ☐ | Every dataset has a metadata sidecar and appears in DATA_PROVENANCE.md. | |
| ☐ | No placeholder code paths; no hard-coded results. | |

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
