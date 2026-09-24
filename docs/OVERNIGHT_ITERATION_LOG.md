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
