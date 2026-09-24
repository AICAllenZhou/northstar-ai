# NORTHSTAR AI — Overnight productization log

Branch: `waicy-overnight-polish` (from `main` @ 52ce431). Rule for every version: backend
tests, frontend lint and production build must pass; screenshots are taken with
`frontend/scripts/demo_screenshots.mjs` and inspected; the research engine, its weights,
and `experiments/results/` are not touched unless a genuine bug is found and documented.

## Version 0 — audit of the starting point (as a first-time WAICY judge)

Opened http://localhost:8000/ cold.

1. *Do I know what NORTHSTAR is?* No. I land directly in a dense command centre: three
   columns, a map, a mission list, a weights expander. The subtitle says "Command Center";
   nothing says what problem this solves or why Northern Canada.
2. *Do I know what problem it solves?* Only after reading the scenario description text in
   the left column, which is small.
3. *Do I know what to click?* Not really. "Demo Mode" is a small button top-right; "Show
   impact · do nothing", "RUN BASELINE", "RUN NORTHSTAR AI" and a policy selector are all
   visible at once with no order.
4. *Do I understand what just happened?* When Demo Mode runs, yes, the captions are good,
   but they are long paragraphs (60–90 words) and the map changes without a pause.
5. *Can I identify the AI contribution?* The RUN NORTHSTAR button is prominent, but the
   words "constraint optimization" appear only inside captions.
6. *Can I understand the experiment?* The Research view is thorough but opens with a wall
   of numbers; the "how we tested" text is at the bottom.
7. *Do I trust the results?* The honesty signals are present (trade-offs, censoring,
   p-values, commit hash) but not visually prioritised.
8. *Does it feel finished?* It feels like an expert tool, not a product: no landing,
   no onboarding, system font, no hierarchy between primary and advanced controls.
9. *Visually confusing:* every panel has equal weight; the disclaimer strip competes with
   the header; ten metrics in the comparison table; timeline speed controls always visible.
10. *Impressive but irrelevant to a judge:* objective-weights table, solver call counts,
    route-risk numbers, replan lists — all on the first screen.

**Plan** (each version ends with tests, build, lint, screenshots, critique, commit):

| Version | Theme | Main moves |
|---|---|---|
| 1 | Make it understandable | Landing website (hero → human problem → research question → how it works → interactive teaser → research validation → data → responsible AI → launch), hash routing (Home / Simulation / Research / Data / About), site header vs app header, first-entry onboarding with "Start guided demo" as the default, copy rewrite |
| 2 | Make it effortless | Guided demo rebuilt as the 10-step narrative (normal → wildfire → closure → medical → cargo → damage → baseline → RUN NORTHSTAR → result → why + research) built live from the primary preset one disruption at a time; simple vs Advanced mode; RUN NORTHSTAR moment with truthful progress; result card with 3–4 metrics; preset cards; result cache + startup warm-up for demo speed |
| 3 | Make it memorable | Type system (bundled IBM Plex Sans Condensed / Sans / Mono, open licence), palette and glass panels, map presentation (grid, glows, route flow, disruption boundary, trails), hero network animation, section reveals, micro-interactions, reduced-motion |
| 4 | Make it credible | Research page as a story (method diagram → headline → distributions → wins/losses/ties → trade-offs → censoring → policy sensitivity → scenario explorer that loads any of the 100 scenarios live), Data page (real vs synthetic, sources, licences), About page (technology conceptually, then stack; responsible AI; limitations), explanation checklist UX |
| 5 | Make it competition-ready | Performance audit of every preset, cold-start and offline test, every route checked, keyboard/ARIA/contrast pass, README + DEMO_SCRIPT + FINAL_WAICY_PRODUCT_REVIEW, final screenshots |

## Performance investigation (cargo-shortage preset, for Versions 2 and 5)

Measured on the development machine, single worker unless stated. The slow calls are
small models (18 missions, 9 aircraft, ~50 feasible pairs) that take 1.7–3.5 s each to
*prove* optimal; total 11 s (6.6 s with 8 workers). Tried, with trace-hash checks:

| Change | Cargo-shortage total / slowest call | Plans identical? | Verdict |
|---|---|---|---|
| `linearization_level = 2` | 50.7 s / 10.0 s (time-outs) | no (kivalliq changed) | rejected |
| `linearization_level = 0` | 14.4 s / 3.7 s | yes | rejected (slower) |
| redundant per-aircraft `NoOverlap` intervals | 13.9 s / 4.7 s | no (kivalliq picked another equal-cost plan) | rejected |

Decision: the validated optimizer is left byte-for-byte unchanged. Demo speed comes from a
result cache keyed on scenario content + strategy + policy (the engine is deterministic,
so identical inputs give identical outputs) and a start-up warm-up that computes every
preset with the real engine; each result carries `cached`, `compute_ms` and `computed_at`
so the interface can state truthfully when the computation happened. Custom scenarios
still compute live (typically 1–3 s; worst observed 10 s).

## Version 1 — "Make it understandable"

**Observed problems (from V0):** no story before the controls; nothing said what NORTHSTAR is or
why the North; the demo entry was a small button; system font and equal-weight panels.

**Decisions:** a real landing website in front of the tool; hash routing (Home / Simulation /
Research / Data / About) so deep links work on the static, offline host; two headers (site vs
app); first-entry onboarding that offers the guided demo as the default; a type system built
from bundled open-licence IBM Plex (Condensed for display, Sans for text, Mono for data); one
signature element, a live "network loop" drawn from the real airports and routes that cycles
CONNECTED → DISRUPTED → OPTIMIZED using the primary preset's wildfire.

**Implementation:** `frontend/src/router.ts`, `frontend/src/site/*` (Home with nine sections,
Data page, About page incl. Responsible AI, network loop model), `components/Onboarding.tsx`,
token/type changes, screenshot driver extended to 26 shots incl. mobile 390 and overflow checks.
Backend: `GET /api/presets/{id}`, `GET /api/experiments/scenarios/{id}`, result cache and
start-up warm-up (`cached` / `compute_ms` / `computed_at` on every run result).

**Test results:** backend 38 passed; `npm run build` 0 errors; `npm run lint` clean; screenshot
driver: no external requests, no page errors; no horizontal overflow at 390 / 768 / 1600 px.

**Visual review (as a judge):** the hero answers "what is this" in one screen: title, one-line
subhead naming Canada, aviation, resilience and AI, the disclaimer, two CTAs, and the live network
with hub labels. The problem section reads in ten seconds. The evidence section shows real
numbers with wins/ties/losses and a visible trade-off. Onboarding puts "Start guided demo · about
4 minutes" first.

**What still needs improvement:**
1. The hero network floats in a void: without a coastline it does not read as *Canada* at a glance (V3: draw the Nunavut outline from the bundled Natural Earth provinces layer behind the loop).
2. Once inside the simulation, everything from V0 is still there: all controls visible, ten-metric table, long captions (V2).
3. The guided demo still loads all four disruptions in one step; the brief's narrative needs them one at a time (V2).
4. "2.2 → 0.2" cancelled flights lacks a unit (per scenario) (V2 copy pass).
5. Command-centre panels still use weight 800 that the bundled fonts do not carry; the map has no grid/glow treatment (V3).
6. Research page keeps its 1440 px layout inside the 1200 px site (V4).

**Commit:** c23d745

## Version 2 — "Make it effortless"

**Observed problems (from V1):** inside the simulation everything from V0 was still visible
(weights, ten-metric table, timeline speeds, solver diagnostics); the guided demo loaded all four
disruptions in one step and read like a tour of the UI rather than a story; RUN NORTHSTAR AI was
one button among several with no moment; the result was a ten-row table; captions were long;
"2.2 → 0.2" lacked a unit; preset names were internal ids.

**Decisions:** Simple mode is the default and Advanced is a header switch (persisted in
`localStorage` as `northstar.advanced`), so weights, the ten-metric table, the replan log and
playback speeds exist but are out of the way. The guided demo builds the scenario one disruption at
a time in narrative order (wildfire → airport closure / aircraft failure → medical emergency →
essential cargo) by posting sub-scenarios made of the preset's own disruption objects, so the full
scenario at step 5 is byte-identical to the preset and hits the same warm-up cache entries. RUN
NORTHSTAR AI is a full-width moment over the map: five stage lines while the request is in flight,
a live timer, then the real solver log replayed from `replans[]`. Truth rules for that moment:
the timer freezes at the response, so a cache hit reads as the milliseconds it took; a
mono line states where the engine actually computed ("computed by the same engine at start-up in
1,359 ms"); and "See the result" is enabled the instant the response arrives — no animation ever
holds the result back. The result is four rows plus one trade-off sentence; "Why" is a checklist of
optimizer fields with "Alternatives considered: N — infeasible / busy / slower"; step 10 ends on
"One scenario is not enough" and a button to the 100-scenario results. Preset cards get display
titles (WILDFIRE CRISIS … CASCADING DISRUPTION), one-sentence descriptions, complexity chips and a
"Precomputed ✓" chip once warm-up is done. Nothing in the backend changed.

**Implementation:** `frontend/src/lib/humanize.ts` (human sentences from live data: disruptions,
missions with 2021 populations, result rows, biggest-gain and trade-off sentences, decision
checklist), `lib/prefs.ts`, `components/{RunMoment,ResultCard,WhyCard,PresetCards,ScenarioSimple,
ActionStack}.tsx`, `styles/simple.css`; `demoSteps.ts` and `DemoStepper.tsx` rewritten (plan
builder, step kinds plain / damage / run / result / why, park-and-resume to Research); `store.ts`
(`advanced`, `runMoment` state machine, `demoRequest` event bus, `loadDemoScenario`, `demoActive`);
`Header.tsx` (Advanced switch, one scenario name), `StatusTiles.tsx` (3–4 simple tiles),
`Timeline.tsx` (speed/trace behind "⋯"), `RunPanel.tsx` (diagnostics: workers, lookahead, UTC
cache line, replan log), `Evidence.tsx` ("flights per scenario"), screenshot driver (new flow,
seven new shots, guided-demo wall time printed).

Bugs found and fixed during the pass: a variant class `demo` collided with the stepper's
fixed-position rule and let the why-card escape the dialog (renamed `in-demo`); the simple tiles
overflowed the right column at 1600 px (`minmax(0,1fr)`); the cargo caption used the request's
relative `params.deadline_min` and printed "by 14:00" for a 16:30 deadline (now the mission's
own deadline); the first version of the run moment gated "See the result" behind ~2.5 s of
stage/log animation even on cache hits, which is exactly the fake waiting the brief forbids
(fixed: result offered immediately, timer frozen at the response, stages instant on cache hits).
Also removed during review: a second "Start guided demo" button that stayed in the right column
while the demo was running; the trade-off sentence that appeared three times on the step-9 screen
(now once, inside the result card); two different names for the loaded scenario in the header and
the panel.

**Test results:** backend `uv run pytest` 38 passed; `npm run build` 0 errors (bundle 1.79 MB /
503 kB gzip, unchanged class); `npm run lint` clean; screenshot driver: no external requests, no
page or console errors, no horizontal overflow at 390 / 768 / 1600 px. Guided demo wall time,
step 1 → step 10 in the driver: 23.5 s, of which 19.2 s are deliberate screenshot pauses; the
API/UI transitions take ≈4 s in total (every result is a warm-up cache hit). The optimizer,
metrics, datasets and `experiments/results/` are untouched.

**Visual review (as a judge):** the story now lands step by step: a normal day, one map change per
step with a one-sentence caption, a damage card in red (5 cut off, medevac not served, cargo not
delivered, 5 of 26 flights cancelled), the baseline's rules stated in one sentence, and a RUN moment
that shows the real solver log (22 calls, every one OPTIMAL, 1.2 s of solving) with the honesty
line about the start-up cache. The result card reads in five seconds: 3 → 0 communities still cut
off, 88.5 h → 53 h, 8 → 0 cancelled flights, and a red 2 h → 5 h 30 cargo delay with the trade-off
named in words. The why checklist is concrete (runway 1,524 m gravel, range 1,141 of 2,800 km,
"6 alternatives — 2 infeasible, 3 busy, 1 slower"). Preset cards finally explain themselves.

**What still needs improvement:**
1. During the demo the right column repeats the result card and the why panel that the demo card already shows; the column should collapse to tiles while the stepper is open, or the stepper should dock to it (V3 layout).
2. Step 10 opens the map's decision popup behind the demo card, so two overlapping cards compete (V3: suppress the popup while a stepper card covers it, or move the card).
3. The map is still the V0 map: no grid, no glow on hubs, no route flow, no boundary for the smoke area, no aircraft trails; in the 1024 px layout the fit leaves the top half of the map empty (V3).
4. The five stage labels are the brief's wording, not solver phases; a judge may ask what "Analyzing network…" means on a cache hit. The honesty line answers it, but the labels could name real steps (feasibility table → candidates → CP-SAT) (V4 credibility pass).
5. Panels still use font-weight 800 that the bundled Plex faces do not carry, so the browser synthesises bold (V3 type pass).
6. Backup presets go through the generic plan/caption path; only the primary preset was screenshot-verified end to end (V5 acceptance).
7. Research page still has the 1440 px layout inside the 1200 px site (V4).

**Commit:** 7f328b5

## Version 3 — "Make it memorable"

**Observed problems (from V2):** the hero network floated in a void and did not read as Canada;
the map was the V0 map (no grid, no hub presence, no smoke boundary, flat used routes, no trails,
hard cuts between Baseline and NORTHSTAR); panels asked for font weights the bundled Plex faces do
not carry, so browsers synthesised bold; the demo card covered the map and, at the climax (steps
8–10), the network it was talking about; the right column repeated the result and why cards
during the demo; the 1024 px layout left half the map empty and clipped Sanikiluaq.

**Decisions:** one signature (the hero network loop) grounded by the real Nunavut coastline drawn
from the bundled Natural Earth provinces layer, through the loop's own projection; a quiet map
treatment in the existing tokens (10°/5° graticule at 7 % ice, Nunavut coastline, soft hub halos,
smoke as inner disc + dashed boundary + softer outer disc, a slow directional dash flow on the
routes the displayed plan actually uses, a short trail behind each flying aircraft, 500 ms paint
cross-fades when switching plans); "arctic glass" only on surfaces that sit over the map or the
page (demo card, run moment, map info panel, legend, scrolled site header), solid columns
everywhere else; one cinematic beat at RUN (map dims to 60 %, the plan's routes fade in on
"See the result") and nothing else; every animation off under `prefers-reduced-motion`. Type:
only bundled weights (Sans 400/500/600, Condensed 600/700, Mono 400/500); display numbers and
headings moved to Condensed 700 with tabular figures. Landing: once-only section reveals, a
staggered hero, evidence numbers counting up to the real values, the launch aurora drifting over
60 s. Chanel rule: the Preview section's five-pill "state chain" was removed (it restated the
Method pipeline and the live stepper and pushed the CTA below the fold on phones).
On review of the agent's pass I found the new "fit the populated south" rule keyed on the map
column width (870 px at the standard 1600 px layout), so it fired on the desktop too and the taller
demo cards then hid the whole network at steps 8–10. Rather than tune the overlay, the guided demo
card now docks into the right column on layouts of 1280 px and wider (in place of the action
stack, which the card makes redundant), so the map is never covered during the demo; below
1280 px it remains a bottom overlay. The fit rule now keys on the viewport width as intended.

**Implementation:** `frontend/src/site/coast.ts` (GeoJSON → SVG paths, ring/bbox culling,
decimation), `site/reveal.ts` (reveal-on-scroll, in-view, count-up hooks), `map/flow.ts` (rAF
dash-array controller at ≈12 fps that stops on reduced motion, hidden tab, no displayed run,
unmount), `scripts/perf_flow.mjs` (frame-rate gate); map layers restructured so each strategy's
used routes are their own solid + flow layers (MapLibre cannot transition data-driven paint, so a
real cross-fade needs per-layer opacity), `lib/derive.ts` (`legFrom`, `usedRouteDirections`),
`map/{style,layers,geo,MapView,MapLegend,InfoPanel}`; `DemoStepper.tsx` (segmented progress bar,
content fade, portal into `#demo-dock`), `views/CommandCenter.tsx` (dock, dim overlay, column
contents during the demo), `StatusTiles.tsx` (value tick, suppressed during playback), the whole
`styles/` set for the type pass and glass; `site/{NetworkLoop,loopModel,Home,Section,Evidence}`;
screenshot driver (three new shots, MapLibre idle wait, reveal-all before full-page captures,
1024/1440 overflow checks, GPU launch on macOS); `frontend/README.md`.

**Test results:** backend `uv run pytest` 38 passed (unchanged; backend untouched); `npm run build` 0
errors (JS 1,800.85 kB / 506 kB gzip, +9 kB over V2 for the coast, flow, reveal and trail code;
CSS 175 kB); `oxlint` 0 warnings; screenshot driver: no external requests, no page or console
errors, no horizontal overflow at 390 / 768 / 1024 / 1440 / 1600 px; guided demo wall time step
1 → 10 in the driver 22.5 s (≈19 s of deliberate screenshot pauses plus a 3 s zoomed-detail
detour). Frame-rate gate (`scripts/perf_flow.mjs`, GPU renderer): 60 fps idle and 60 fps at 2×
playback with flow and trails; the flow loop stops within a second of no run being displayed.
Headless software WebGL measures 21–28 fps, which is the emulator, not the app. `grep` for
`font-weight: 700/800/900` returns nine hits, all on `--font-display` rules. Optimizer, metrics,
datasets and `experiments/results/` untouched.

**Visual review (as a judge):** the hero now reads as Arctic Canada at a glance: Baffin Island, Hudson Bay
and the mainland behind the network, hubs labelled, red closures and amber cut-off communities in
the DISRUPTED phase. The command-centre map has depth without noise: a faint graticule, a
coastline for the territory, soft halos on hubs, the smoke as a disc with a dashed boundary and a
softer outer ring, and the plan's routes flowing in the direction flown (grey for the baseline,
teal for NORTHSTAR), with short trails behind flying aircraft. Switching plans cross-fades.
Pressing RUN dims the map and brings up the glass solver card; "See the result" lifts the dim and
the teal routes fade in. With the demo card docked in the right column, every step shows the whole
network next to the numbers it is talking about; the damage grid, the four-row result and the
why checklist all fit the column at 1600 px. Type is finally one family at real weights.
Weak spots: at Cambridge Bay a mission marker sits on the hub label; the legend covers
Sanikiluaq's label at 1600 px; the docked card is smaller than the old modal, so the RUN button
is less theatrical (deliberate: the map is the show).

**What still needs improvement:**
1. Label and marker collisions at hubs (Cambridge Bay medevac marker over the label; Rankin Inlet cluster); the legend hides Sanikiluaq's label. V5: declutter rules for markers on hubs, a collapsible legend.
2. Step 3 is titled "Airport closure" but the event it adds is the ATR 42 aircraft failure (the wildfire closed the airport in step 2). V4 copy pass.
3. The five RUN stage labels are the brief's wording, not the optimizer's real phases; on a cache hit they complete at once and only the fact line explains. V4: name the real steps (feasibility table → candidate pairs → CP-SAT model → solve → simulator validation) and show the retrieved-from-start-up state plainly.
4. Research page still has the 1440 px layout inside the 1200 px site and no story order (V4).
5. Experiment summary solver line: 154 of the 2,438 "CP-SAT calls" were NO FEASIBLE SOLUTION decisions with no solve (found while V3 ran; runner and methodology already changed, uncommitted). V4: regression test, hash-verified re-run, Research page copy.
6. The 1280–1439 px three-column case (docked card in a 440 px column) is implemented but not screenshot-verified; toggling Advanced mid-demo moves the card back to the overlay. V5 acceptance.
7. `scripts/demo.sh` runs the smoke test against the shared session at start-up, so the first screen a presenter sees is the loaded primary preset, not the healthy network (V5).

**Commit:** 40a7f6f

## Version 4 — "Make it credible"

**Observed problems (from V3):** the Research page was a dashboard, not an argument: a
1440 px grid inside the 1200 px site, five bar cards, one win/loss chart, a per-scenario table,
and a "Solver" line that said "2,438 CP-SAT calls · 2,284 proven optimal" and left 154 calls
unexplained. Losses were countable but not visible per scenario. The Data page listed sidecars
without saying what each dataset is for or what was deliberately not done; the About page had
the Responsible AI statement but no limitations or "distance to reality". In the command centre
the five RUN stage labels were the brief's wording rather than the optimizer's phases, step 3
was titled "Airport closure" for an aircraft-failure event, and "Alternatives considered"
showed counts without the rejected aircraft.

**Decisions:** the Research page tells the study in the order a reviewer asks questions:
question → method (five nodes) → three headline numbers chosen by a stated rule (largest
wins-minus-losses margin among the resilience metrics; the rule and the runners-up are printed,
and the first hypothesis, medical response with 69 ties, is named as *not* a headline) → one
paired-difference strip per metric with all 100 scenarios as ticks, losses in the warm colour,
own symmetric scale, median marker → "Where NORTHSTAR loses" with the reroute trade-off
explained (it re-plans at every event; each change costs 600 in the balanced objective) and the
two scenarios where it was worse on disconnected-community hours, each with **Open in
simulator** (the generated scenario loads into the command centre and the run buttons solve it
live) → censoring → policy sensitivity with a data-driven sentence about the metric that moves
most between profiles → solver honesty as one stacked bar whose legend states the sum →
a sortable, filterable explorer of all 100 rows → a reproduce block (command, seed, commit,
OR-Tools, platform, CSV). Every number is read from the API; the report carries a source-field
audit for every number in two of the shots. The strips recompute wins/losses/ties client-side
with the runner's tie tolerance and reproduce the API's counts for all ten metrics.

The solver accounting defect found during V3 was fixed before this page was built: the runner
now buckets every replanning decision (2,284 CP-SAT solves, all proven optimal; 0 feasible-not-
optimal; 0 time-outs; 154 decisions at which no usable aircraft could reach any pending mission,
answered as NO FEASIBLE SOLUTION without a solve), a regression test guards the arithmetic and
the committed summary, the methodology §7 explains it, and the experiment was re-run at commit
5f0d9ab: 500 runs, zero trace-hash differences, zero changed metric cells (commits 5f0d9ab,
a8ede20).

Two things checked by hand while reviewing the pass. (1) The agent flagged a 0-minute NORTHSTAR
medical response in gen-42-000. Traced: AC-09 (PC-12 medevac) flew cargo request CGO-01 from
Cambridge Bay to Taloyoak at 06:30 and was still on the ground there when the medevac was called
at 17:00 from Taloyoak; missions become visible only at their call time (`known_min`), so this is
positioning luck, not foresight. Baseline used AC-06 from Cambridge Bay (60 min). No change.
(2) The why-card's new alternatives table printed "chosen · response 6h after request" for the
Chesterfield Inlet medevac while the checklist said 4 h. The decision record's `response_min` is
a clock time (minutes since 06:00; 360 = 12:00), and the frontend read it as a duration. Fixed:
the record now also carries `release_min` and `response_after_request_min`; the why-card uses
the duration and prints the pick-up clock time beside it; `test_decision_record_response_fields_
are_consistent` asserts the duration equals the `vs_baseline` value for every completed medevac.
Explanations are computed at request time and are not part of `experiments/results/`, so no
re-run was needed.

**Implementation:** `frontend/src/views/Research.tsx` (rewritten), `views/research/{Charts.tsx
(plain-SVG DiffStrip, WltBar, SolverBar), Explorer.tsx, paired.ts}`, `styles/research.css`
(1200 px), `api/{types,client}.ts` (`experimentScenario`, optional solver fields, decision
record fields), `state/store.ts` (`openExperimentScenario`), `site/{DataPage,AboutPage,copy}`,
`styles/site.css`; `components/{RunMoment (real phases, single cache sentence), WhyCard
(alternatives table, duration fix), demoSteps ("Hub closed, aircraft down")}`; backend
`northstar/explain/explain.py` (+2 fields), `tests/test_api.py` (+1 test); driver (+9 shots incl.
`research-open-sim` proving the round trip, and a reset so the demo that follows starts healthy).
Recharts is no longer imported (the dependency stays in `package.json`), which is why the bundle
dropped from 1.80 MB to 1.47 MB.

**Test results:** backend `uv run pytest` 41 passed (38 original + 2 solver-bucket tests + 1
decision-record consistency test); `npm run build` 0 errors (JS 1,470.86 kB / 412 kB gzip, down
from 1,800 kB because Recharts is no longer imported; CSS 183 kB); `oxlint` 0 warnings; screenshot
driver after the server restart: no external requests, no page or console errors, no horizontal
overflow at 390 / 768 / 1024 / 1440 / 1600 px, guided demo step 1 → 10 in 22.2 s (≈19 s of
screenshot pauses), the open-in-simulator round trip asserted (hash, header name, disruption
count from `/api/experiments/scenarios/{id}` equal to `/api/scenario`), session reset to the
healthy network afterwards. The agent's numbers audit maps every figure in `research-story.png`
and `research-losses.png` to a `summary.json` field. Experiment: re-run at 5f0d9ab, 500 runs,
0 trace-hash differences, 0 changed metric cells; `summary.json` `git_dirty: false`.

**Visual review (as a judge):** the Research page now reads like a paper's results section: the question, the
"what would count as an answer" line, a mono meta line with n, seed, policy, commit and OR-Tools
version, a five-node method diagram, three headline cards that print their own selection rule
and name the runner-up metrics and the ties on medical response. The strips are the honest
centrepiece: a hundred ticks per metric, the two disconnected-hours losses and the sixty-five
reroute losses in warm orange, medians marked, extremes labelled in words. "Where NORTHSTAR
loses" names the two scenarios and lets a judge open either one in the simulator and re-run it
live. The solver block's stacked bar visibly sums to 2,438 and explains the 154 no-feasible
decisions in a sentence. Data and About pages carry provenance badges, the not-done list,
limitations and distance-to-reality. In the command centre the RUN stages now name the real
phases and the cache sentence is one line; step 3 reads "Hub closed, aircraft down"; the why-card
lists all ten aircraft with the optimizer's verdict and reason, chosen row "response 4h after
request (pick-up 12:00)". Weak spots: the raw generator description ("1 closure(s), 2 weather
event(s)…") shows in the header and scenario panel when a generated scenario is opened; the
explorer's "Headline 5" default hides the reroute column, which is where the losses are (the
strips above cover it, but a judge scanning the table will not see a loss column by default).

**What still needs improvement:**
1. Humanize the generated-scenario description ("1 closure(s), 2 weather event(s)…") in the header and scenario panel when a scenario is opened from the Research page (V5 copy).
2. Explorer default columns: include reroutes (the trade-off metric) in the default view or label the toggle "Resilience 5 / All 10" so losses are one click away, not hidden (V5).
3. Label and marker collisions at hubs (Cambridge Bay, Rankin Inlet cluster) and the legend covering Sanikiluaq at 1600 px (carried from V3; V5 declutter + collapsible legend).
4. The 1280–1439 px three-column layout with the docked demo card is still not screenshot-verified; add a 1280 shot to the driver (V5).
5. Keyboard and screen-reader pass across the site and the command centre (focus order in the docked card, `aria-live` volume, contrast of the ice-blue mono captions) (V5).
6. Cold-start acceptance from a fresh clone (`uv sync`, `npm ci`, build, `scripts/demo.sh`, driver) and the `--verify` gate on a quiet CPU (V5).
7. README, readiness checklist and the final product review still describe V0 in places (V5 docs).

**Commit:** e16f190

## Version 5 — "Make it competition-ready"

**Observed problems (from V4):** marker and label collisions at busy hubs and a legend that
covered Sanikiluaq; the raw generator description in the header when an experiment scenario was
opened; the explorer's default columns hid the reroute (trade-off) column; the 1280–1439 px
docked layout and reduced-motion behaviour were implemented but never screenshot-verified; no
accessibility floor had been checked; the launcher, README, checklist and final review still
described the first build; no cold-start acceptance from a fresh clone had been run.

**Decisions:** finish, verify, document; add nothing new. The launcher waits for the warm-up
and leaves the session healthy (done in 4d26c02). A fresh clone must reach a working demo with
the documented commands; the browser driver is the acceptance test; `--verify` is the
reproducibility gate; the readiness checklist is rewritten with evidence per line; the final
product review states strengths, weaknesses, what not to change, what to emphasize, likely judge
questions and the exact stage path.

Map declutter: mission markers sit above-left of the dot with a fixed offset that clears the
label row, several missions at one airport fan out, and the label declutter measures real label
widths, knows about mission markers and parked-aircraft rows, places hub labels first (always
visible) and tries beside → below → above → left for community labels before hiding one; the
driver asserts no marker or community label touches a hub label at step 9. The legend is a
collapsible button (expanded by default at ≥ 1440 px, remembered per viewer), stacked bottom-left
above the info panel and folded while the panel is open. Generated scenarios opened from the
Research page now read "1 closure · 2 weather events · 3 medevacs · 2 cargo requests" with the
sentence "Scenario 96 of the 100-scenario experiment (seed 42); the run buttons solve it live."
The explorer's default column set is "Resilience 6" (the five headline metrics plus reroutes, so
the loss column is visible by default). Accessibility floor: every panel eyebrow became a real
heading (h1 → h2 → h3 with no skips on any page), inputs and selects show a focus ring again
(a global `outline: none` had removed it), MapLibre's zoom buttons use the site's ring, the
scrubber thumb has a ring, `--ink-3` was raised from #6c7d8e to #7a8b9c so every text under
14 px clears 4.5:1 on its real background, and reduced motion now also caps infinite animations
(they were still cycling at 0.001 ms). Nothing else was added.

**Implementation:** `frontend/src/map/{markers.ts, MapView.tsx, MapLegend.tsx}`, `styles/map.css`;
`lib/humanize.ts` (`compactDescription`, `scenarioBlurb`, `experimentSentence`), `views/research/
{paired.ts, Explorer.tsx}`, `views/Research.tsx`, `components/{ScenarioSimple, ScenarioPanel,
StatusTiles, WhyCard, MissionList, ComparePanel, DecisionsPanel}.tsx`, `site/AboutPage.tsx`;
`styles/{tokens, base, timeline, simple, panels}.css`; driver (+≈360 lines: accessibility audit,
contrast sampler, three keyboard walks, 1280 px shots, reduced-motion pass, legend and collision
checks); `frontend/README.md`. Docs: `README.md` (rewritten: what you get, truth rules, run
and experiment commands, headline numbers with a pointer to the live page), `docs/WAICY_READINESS_
CHECKLIST.md` (rewritten with current evidence), `docs/FINAL_WAICY_PRODUCT_REVIEW.md` (new),
`docs/DEMO_SCRIPT.md` (V2 flow, launcher wording), `docs/IMPLEMENTATION_PLAN.md` §9.1 (items 6–7),
`docs/ARCHITECTURE.md` (decision record fields), `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md` §7
(solver accounting); `scripts/{demo.sh,wait_ready.py,smoke_test.py}`.

**Test results:** backend `uv run pytest` 41 passed; `npm run build` 0 errors (JS 1,474 kB / 413 kB
gzip, CSS 184 kB); `oxlint` 0 warnings; screenshot driver: no external requests, no page or
console errors, no horizontal overflow at 390 / 768 / 1024 / 1280 / 1440 / 1600 px; guided demo
step 1 → 10 22.5 s net (30.7 s with the added keyboard walks, collision check and 1280 px shots
inside the loop); accessibility audit clean on Home, Data, About, Research and Simulation (names,
labels, alt text, one h1, no heading skips, dialog label); contrast sampler: 0 texts under 14 px
below 4.5:1 across the five pages (`--ink-3` on panels 4.33 → 5.24); keyboard walks reach the
header demo button, preset cards, RUN NORTHSTAR AI, the docked card's Back / RUN / Next and the
timeline in order, every stop with a visible ring; reduced-motion pass at step 9: flow loop not
running, zero running CSS animations outside MapLibre. Preset performance (API, warm backend,
balanced): every preset served from the start-up cache in 10–12 ms HTTP; original compute times
recorded on the results: kivalliq 1.24 s, baffin 0.59 s, kitikmeot 0.85 s, cargo_shortage 5.98 s,
cascading 0.64 s (NORTHSTAR; baselines ≤ 22 ms); one genuinely uncached custom scenario (Iqaluit
closed 10:00–14:00 on the healthy network) solved live in 600 ms, `cached: false`, 16 calls all
OPTIMAL, and NORTHSTAR changed nothing because no mission was affected (a truthful "no change").

**Cold-start acceptance (fresh clone of 8f33780 into a scratch directory, port 8020, warm
package caches):** clone → `uv sync` 1 s → `npm ci` 2 s → `npm run build` 4 s → `scripts/demo.sh`
ready after 46 s of warm-up (55 s from clone to "ready"); session on start-up: "Healthy network
(no disruption)"; full browser driver against the clone: 99 s, no external requests, no page
errors, no overflow, guided demo 22.4 s; `uv run pytest` 41 passed; launcher stopped, port
released. Reproducibility gate on the repository itself: `run_experiments.py --verify` → "VERIFY OK: 500 runs reproduce the committed trace hashes" (67 s wall, 8 processes).

**Visual review (as a judge):** the hubs are readable at every step: mission boxes float clear of the labels, the
Rankin Inlet cluster no longer swallows Arviat, Sanikiluaq sits in open water with the legend now
bottom-left and collapsible. At 1280 px the docked card keeps its four result rows and one row of
buttons; the map shows the populated south large. Under reduced motion the same screen is simply
still. A scenario opened from the Research page finally reads like a sentence and says where it
came from. The remaining rough edge is small: two parked-aircraft ids can run together under a
hub ("0903" at Cambridge Bay) at the default zoom, and flying aircraft still cross hub labels
(the labels now sit above them).

**What still needs improvement (after the sprint):**
1. Parked-aircraft id rows can touch at the default zoom (Cambridge Bay "09 03"); widen the slot or hide ids below a zoom threshold.
2. Below 1280 px the sticky timeline covers the bottom of the map until the page scrolls (legend pill hidden); acceptable for a phone, not a stage layout.
3. The "What's happening" mission rows are clickable list items without keyboard access; make them buttons.
4. Toggling Advanced while the guided demo is open moves the card from the column to the overlay; either lock the switch during the demo or dock in Advanced too.
5. Medical-first and Connectivity-first runs of the Kitikmeot preset are not precomputed (only Balanced is warmed), so a live profile switch on stage solves in about a second; acceptable, but say so.
6. The presenter rehearsal (three timed run-throughs) is the one checklist item the build cannot tick.

**Commit:** af5a6f0

## Version 6 — "Stage hardening" (beyond the five mandated passes)

**Observed problems (from V5):** the "do the weights matter?" moment on stage (switch the profile
to Medical-first on the Kitikmeot preset and run again) was the one demo path that still solved
live, because only the Balanced profile was precomputed; toggling Advanced while the guided demo
was open moved the docked card to a bottom overlay; the "What's happening" mission rows were
clickable but not keyboard-operable; two parked-aircraft ids could touch at the default zoom; on
single-column layouts the sticky timeline could cover the legend button.

**Decisions:** five small, verifiable fixes and nothing else. Warm-up now runs two passes:
do-nothing, baseline and NORTHSTAR-Balanced for every preset first (the guided demo's path),
then the other three profiles (Medical-first, Connectivity-first, Cost-conscious) for every preset, so
a live profile switch is served from the same cache and declared as such; custom scenarios are still never precomputed. The
Advanced switch is disabled while the guided demo is open, with a tooltip saying why. Mission rows
take `role="button"`, a tab stop, Enter/Space and the standard focus ring. Parked aircraft fan out
at 21 px instead of 17 px. Below 1280 px the legend and info panel move to the free top-left
corner of the map. The final review's known-issues list and sprint table are updated.

**Implementation:** `backend/northstar/api/session.py` (`warm_up`: two passes, `policies` in the
health payload), `backend/tests/test_api.py` (`test_warm_up_precomputes_every_policy_profile`),
`scripts/wait_ready.py` (ready line names the profile count), `frontend/src/components/{Header,
ScenarioSimple}.tsx`, `frontend/src/map/MapView.tsx`, `frontend/src/styles/{header,simple,map}.css`,
`docs/FINAL_WAICY_PRODUCT_REVIEW.md`.

**Test results:** backend `uv run pytest` 42 passed (new: `test_warm_up_precomputes_every_policy_profile`,
which runs the real warm-up on one preset and asserts every profile is then served from cache);
`npm run build` 0 errors (JS 1,474 kB / 413 kB gzip, CSS 184 kB); `oxlint` clean; server
restarted: warm-up 30 / 30 in 37 s (was 15 in about 10 s), health lists the four profiles;
screenshot driver: no external requests, no page or console errors, no overflow at any width,
guided demo 22.5 s net; the keyboard walk at step 9 now has 21 stops and includes the two mission
rows ("Urgent medical evacuation…", "Essential cargo…") between Reset and the flights toggle;
accessibility and contrast audits clean; reduced-motion pass unchanged. One process slip worth
recording: the first two V6 screenshot runs used the previous bundle (a relative `cd` in a
background shell and then a duplicate identifier that failed `tsc`); both were caught by reading
the build log and the shots, and the third run is the one reported here.

**Visual review (as a judge):** the Advanced switch reads as dimmed and unavailable while the demo card is docked, with
a tooltip that says why; parked aircraft at Cambridge Bay, Rankin Inlet and Iqaluit sit apart with
their ids legible; on the 1024 px single-column layout the "Legend" pill sits top-left, clear of
the sticky timeline; the mission rows take focus with the same ring as every other control.
Nothing else moved.

**What still needs improvement (after the sprint):**
1. The presenter rehearsal (three timed run-throughs with `docs/DEMO_SCRIPT.md`) is the one checklist item the build cannot tick.
2. Flying aircraft still cross hub labels by nature; the labels sit above them and stay legible, but a purist would route the icons around.
3. Warm-up now takes longer (30 computations instead of 15: 37 s on the development machine instead of about 10 s); the launcher waits and prints the time, and the demo script says not to start before "ready".

**Commit:** _pending_
