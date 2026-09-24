# NORTHSTAR AI — Final WAICY Product Review

Written for the presenting team and their mentors at the end of the overnight
sprint (2026-09-24, branch `waicy-overnight-polish`). It says what is strong,
what is weak, what not to touch before the competition, what to emphasize, what
judges are likely to ask, and the exact path to walk on stage. The engineering
record behind every claim is `docs/OVERNIGHT_ITERATION_LOG.md`.

## 1. What is being judged

A research prototype that asks one question — *can AI-assisted optimization
improve the resilience of remote and Northern aviation networks during major
disruptions?* — and answers it inside a simulation with a paired experiment:
a rule-based baseline and a constraint-programming optimizer (OR-Tools CP-SAT)
run on the same 100 generated disruption days from the same start, through the
same simulator, scored by the same metric function, with losses kept. Around
that sit a website, a command centre with a ten-step guided demo, a Research
page that tells the study in order, and Data / About pages that declare what is
real, what is synthetic and what the simulation leaves out.

## 2. Strongest aspects

1. **The evidence is paired, reproducible and honest.** Seed 42, 100 scenarios,
   commit hash and dirty flag recorded in the summary, a `--verify` mode that
   reproduces 500 trace hashes, per-scenario strips that show every loss, a
   trade-off (reroutes, baseline better in 65 of 100) on the landing page and on
   the Research page, and a solver accounting whose four buckets visibly sum
   to the total.
2. **Every decision is explained from the optimizer's own fields.** The why-card
   lists all ten aircraft with the verdict and reason the feasibility table gave
   (busy, worse, rejected, stranded, failed), the realized response time next to
   the baseline's, and the trade-off it caused. No language model anywhere.
3. **The demo is one button per step and never pretends.** Ten steps build the
   scenario one disruption at a time; the RUN moment shows the real solver log,
   says when the result was computed (start-up warm-up, same engine) and enables
   *See the result* the instant the response arrives. Custom scenarios and any
   experiment scenario opened from the Research page solve live.
4. **Real geography, synthetic operations, kept apart on every page.** Airports,
   runways, populations and coastlines are public data with provenance; fleet,
   schedule and demand are declared assumptions with SYNTHETIC badges. The
   disclaimer is on every screen.
5. **It runs offline from one command and starts on the healthy network.**
   `scripts/demo.sh` builds once, waits for the warm-up, prints "ready", and the
   Playwright driver proves no request ever leaves the machine.

## 3. Weakest aspects (say them before a judge does)

1. **Operations are synthetic.** The fleet, the daily schedule and the demand are
   invented; nothing here is a claim about a real airline. The gap between the
   two dispatchers is a gap inside this model.
2. **The baseline is a rule set, not an expert.** It is fair (same feasibility
   rules, same simulator, protects the schedule, retries) and its first version
   was rewritten because it lost to doing nothing, but human dispatchers are
   better than seven rules. The improvement is an upper bound on "over a simple
   rule set".
3. **The optimizer optimizes what the metrics measure.** That is by design and it
   is disclosed; the per-metric win/loss counts and the three policy profiles
   exist to make the circularity visible rather than hide it.
4. **Medical response, the first hypothesis, mostly ties** (24 better / 7 worse /
   69 tied): response time is usually limited by distance, not by planning. The
   headline numbers are connectivity, passenger delay and cancelled flights.
5. **One network, deterministic execution, 30-minute steps, no crew, fuel,
   forecast, night or capacity constraints.** Listed on the About page and in the
   methodology; a plan that is good under certainty may be brittle.
6. **The demo's speed comes from a declared start-up cache.** The screen says so
   and the same button solves custom scenarios live in one to ten seconds, but a
   judge who wants to see a cold solve should be shown one (Advanced → Custom
   scenario → add a closure → RUN).

## 4. What NOT to change before the competition

- The objective weights, the baseline rules, the datasets, the scenario
  generator, the metrics, or anything under `experiments/results/`. Every one of
  them is tied to the committed experiment; a change without a re-run turns the
  Research page into a lie.
- The guided demo's step logic and captions. They are verified end to end by the
  driver and rehearsed by the script.
- The honesty lines: the cache sentence in the RUN moment, the trade-off sentence
  in the result card, the disclaimer strip, the "no language model" footers.
- Do not add features. No chatbot, no forecast, no real-time feed, no login.
  Anything new is untested and costs credibility more than it earns.

## 5. What to emphasize on stage

- "Same start, same simulator, same yardstick." Say it once at the method and
  once at the result.
- Three numbers and one trade-off from the live screen: communities still cut
  off 3 → 0, hours without service 88.5 → 53, cancelled flights 8 → 0, and the
  cargo that arrives 3 h 30 later. Then: "one scenario proves nothing" and the
  hundred-scenario page.
- The why-card: point at "runway compatible (1524 m gravel)" and "6 alternatives
  — 2 infeasible, 3 busy, 1 slower". That is the AI being accountable.
- The solver bar: 2,438 decisions, 2,284 proven optimal, 154 honest "no feasible
  solution" answers, zero time-outs.
- Human in the loop: NORTHSTAR recommends; a dispatcher decides.

## 6. Likely judge questions

| Question | Answer (short) |
|---|---|
| Where is the AI? | Constraint optimization: a declared model of aircraft, missions, routes and rules, searched by CP-SAT with propagation and learning. Deliberately no machine-learned model, because no defensible labelled dataset exists offline (methodology §10). |
| Was that result precomputed? | Yes, at start-up, by the same engine, and the screen says so with the time it took. Custom scenarios and any experiment scenario opened from Research solve live. The 100-scenario experiment uses no cache. |
| Is the baseline a strawman? | It keeps scheduled aircraft on their flights, retries, and uses the same feasibility rules; its first version lost to doing nothing and was rewritten before any result was kept. It represents dispatch on demand, not expert humans. |
| Why does the cargo arrive later under NORTHSTAR? | The Balanced profile weights community connectivity above cargo lateness once a deadline is already missed. Switch to another profile and the recommendation changes; the trade-off is shown, not hidden. |
| Why so many reroutes? | NORTHSTAR re-plans at every event and moves a mission when that lowers the weighted total; each change costs 600 in the objective, so it happens only when the rest gains more. The baseline never revisits an assignment. Baseline better in 65 of 100 on that metric. |
| What are the 154 "no feasible solution" decisions? | Moments at which no usable aircraft could reach any pending mission (closed airports, range, runway, availability). The optimizer says so explicitly instead of inventing a plan; the next event triggers a new decision. |
| Why count unserved missions at the horizon end? | Conservative, identical for both strategies, and the censored counts are printed next to every average. |
| How do you know the simulator is fair? | Both strategies see the same events at the same time (`known_min`), use the same feasibility helper, and every assignment is re-validated by the simulator (zero rejections in 500 runs). Tested. |
| Is the data real? | Airports, runways, populations, coastlines: real, public, with provenance. Fleet, schedule, demand, disruptions: synthetic, declared, badged. |
| Would this generalise? | Unknown and not claimed. One network, synthetic operations, deterministic day. The About page lists what it would take to use for real. |
| What would you do next? | Validated operational data, forecast and uncertainty-aware planning, crew and maintenance constraints, a comparison against recorded human dispatch decisions, and a real operator in the loop. |
| Can I see a scenario where it lost? | Yes: Research → "Where NORTHSTAR loses" → Open in simulator → RUN. |
| Does NORTHSTAR ever make a medevac slower? | Yes, and it is on screen: in the *Medical emergency + aircraft failure* preset the Balanced profile accepts a 105-minute mean medical response versus 60 under the baseline in order to keep two communities connected (8 → 0 disconnected-community hours). Switch the profile to Medical-first and the recommendation changes. Across the 100 scenarios medical response is better in 24, worse in 7, tied in 69. |

## 7. Exact live demo path (about four and a half minutes)

1. Before: Wi-Fi off, `scripts/demo.sh`, wait for "ready", open
   http://localhost:8000/, scroll the landing page once, click **Launch
   NORTHSTAR**. The welcome dialog's first button is **Start guided demo**.
2. Steps 1–7: press **Next** on the demo card (docked in the right column on a
   wide screen) once per step; say the caption in your own words; point at the
   map. Step 6 is the damage card; step 7 plays the baseline by itself.
3. Step 8: press **RUN NORTHSTAR AI** on the card. The map dims, the solver log
   replays, "Plan ready" appears. Press **See the result**.
4. Step 9: read the four rows and the red trade-off line. Step 10: read three
   checklist lines and the alternatives count; press **See the 100-scenario
   results**.
5. Research: headline cards, one strip with visible losses (reroutes), the solver
   bar. Close with the Responsible AI sentence. **Back to the demo** returns to
   step 10 if there is time for questions on the map.

Narration and fallbacks: `docs/DEMO_SCRIPT.md`.

## 8. Known issues

- Label and marker collisions at busy hubs are reduced, not eliminated, at some
  zoom levels; the legend can be collapsed if it covers a label.
- Toggling **Advanced** while the guided demo is open moves the demo card from
  the right column to a bottom overlay; toggle it before or after the demo.
- Below 1280 px the command centre is single-column with the demo card as a
  bottom overlay; usable, not the intended stage layout.
- The medical-response metric ties in 69 of 100 scenarios; do not present it as
  a headline.
- The experiment takes 1–3 minutes to re-run on a laptop; `--verify` doubles
  that. Run it the day before, not on stage.
- Below 1280 px the sticky timeline hides the bottom of the map (and the legend
  button) until the page scrolls.
- The mission rows under "What's happening" are clickable but not reachable by
  keyboard; every button, link, switch and the scrubber are.
- Only the Balanced profile is precomputed for each preset; switching the profile
  in Advanced mode solves live (about a second on the presets).

## 9. How to run it (exact)

```bash
git clone <repo> && cd northstar-ai
git checkout waicy-overnight-polish
scripts/demo.sh                      # installs backend deps with uv, builds the frontend once, serves http://localhost:8000/
# tests and checks
cd backend && uv run pytest          # 41 tests
cd ../frontend && npm run build && npx oxlint
BASE_URL=http://localhost:8000 node scripts/demo_screenshots.mjs   # every page, ten steps, failure states, no external requests
# experiment
cd ../backend && uv run python ../experiments/run_experiments.py --n 100 --seed 42
uv run python ../experiments/run_experiments.py --verify
```

## 10. Sprint summary

Five reviewed iterations on `waicy-overnight-polish`, each with tests, lint,
build, a screenshot set, a judge-style critique and a commit hash
(`docs/OVERNIGHT_ITERATION_LOG.md`):

| Version | Theme | Commit |
|---|---|---|
| V1 | Make it understandable: landing website, routing, onboarding, type system | c23d745 |
| V2 | Make it effortless: simple/advanced modes, ten-step incremental demo, RUN moment, result and why cards | 7f328b5 |
| V3 | Make it memorable: coastline behind the hero, map depth (graticule, halos, smoke boundary, route flow, trails), glass, docked demo card | 40a7f6f |
| — | Experiment runner: four solver buckets; results re-run at 5f0d9ab (0 hash differences); regression tests | 5f0d9ab, a8ede20 |
| V4 | Make it credible: Research page as a story, per-scenario strips, open-in-simulator, solver accounting, Data/About depth, decision-record fix | e16f190 |
| V5 | Make it competition-ready: declutter, accessibility floor, 1280 px check, cold-start acceptance, docs | af5a6f0 |

Final branch: `waicy-overnight-polish`. Final commit: af5a6f0 (V5); the small commit after it records this hash in the log and this document, and is the branch tip.
