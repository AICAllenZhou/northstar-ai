# NORTHSTAR AI — frontend

React 19 + TypeScript + MapLibre GL 6 + Recharts 3 + Zustand 5, built with Vite.
One offline single-page app with two faces: a storytelling site (Home, Research,
Data, About) and the "command center" simulation. Everything runs against the
local FastAPI backend; no external request is ever made.

## Routes (hash router, `src/router.ts`)

| Route | Page | Header |
|---|---|---|
| `#/` | Landing: hero with the live network loop, situation, research question, method, preview, evidence (from `/api/experiments/latest`), data, limits, launch | site header |
| `#/simulation` | Command center (mounted on first visit, then kept mounted so the map keeps its state). `?demo=1` starts the guided demo directly. | app header |
| `#/research` | Research results, told as a story (see below) | site header |
| `#/data` | Data and provenance (real vs synthetic, dataset sidecars from `/api/network.metadata`) | site header |
| `#/about` | About the technology, Responsible AI (`#/about#responsible-ai`), credits | site header |

Hash routing survives the static host (the backend serves `index.html` at `/`
and the hash never reaches the server), so every deep link reloads correctly.
The store keeps the legacy `view` field for the demo steps; `setView()` maps
`command` / `research` / `responsible` to the routes above.

On the first visit to `#/simulation` in a browser session a welcome dialog
offers "Start guided demo" or "Explore on my own" (`sessionStorage`
`northstar.onboarded`); `#/simulation?demo=1` skips it.

## Research page

`views/Research.tsx` (+ `views/research/Charts.tsx`, `Explorer.tsx`,
`styles/research.css`) reads `/api/experiments/latest` once and renders the
paired experiment in this order, at the site width: **the question** and what
would count as an answer (page head, with n, seed, policy, commit, generated
date and OR-Tools version from the summary) → **method** (five-node diagram,
CSS only) → **headline** (the three resilience metrics with the largest
wins-minus-losses margin, each as baseline → NORTHSTAR mean, improvement,
W/L/T bar, sign test and the do-nothing reference; a caption says why those
three) → **every scenario, every metric** (one paired-difference strip per
primary metric, plain SVG: one tick per scenario at NORTHSTAR − baseline,
oriented so left of zero is NORTHSTAR better, own symmetric scale, ties with
the runner's tolerance, median marker, losses in the warm colour) → **where
NORTHSTAR loses** (the `tradeoffs` metrics with W/L/T, why more reroutes are
expected, and the individual scenarios where NORTHSTAR was worse on
disconnected-community hours, each with **Open in simulator**) → **censoring
and completeness** → **policy sensitivity** (table plus a sentence naming the
metric on which the profiles disagree most, and the weights that differ) →
**solver honesty** (one stacked bar of the four buckets that sums to the
replanning decisions; `cpsat_calls` / `no_feasible_calls` are optional and
derived when absent) → **scenario explorer** (all rows, sticky header,
click a metric header to sort worst-for-NORTHSTAR first, filter on the
disruption mix, "Resilience 6" columns by default — the five headline metrics
plus reroutes, the column where NORTHSTAR loses — or "All 10", Open in
simulator per row) →
**reproduce it** (command built from n and seed, commit and dirty flag,
versions, generated time, CSV download, file names, methodology document).

**Open in simulator** (`store.openExperimentScenario`) fetches
`/api/experiments/scenarios/{id}`, posts it to `/api/scenario/load
{scenario}` and navigates to `#/simulation`; the run buttons there solve that
scenario live. In the command centre the scenario card compacts the
generator's count list ("3 closure(s), 0 weather event(s), 1 medevac(s)" →
"3 closures · 1 medevac", `lib/humanize.compactDescription`, shared with the
Research tables) and adds "Scenario *n* of the *N*-scenario experiment (seed
*s*); the run buttons solve it live." — *n* is the number in the id
(`gen-42-017` → 17, the same number as in "Generated scenario 17"), *N* and
the seed come from `/api/experiments/latest`, and the sentence is omitted
until that summary is loaded or when the id is not one of its rows. The empty (404), error and loading states keep the `.rs-empty`
card; the guided demo still parks on this page with the "Back to the demo"
toast.

## Simple mode and Advanced mode

The command centre opens in **simple mode**: preset cards (or a compact
scenario card), "What's happening" in human sentences, three or four status
tiles, the primary action stack (Start guided demo · RUN NORTHSTAR AI · Run
baseline first), the four-row *result card* and the *why card* for the top
decision. The **Advanced** switch in the app header (persisted in
`localStorage` `northstar.advanced`) reveals everything else: the disruption
form, "Show impact if nobody reacts", the policy profile and weights, the
ten-metric Before vs After table, solver diagnostics (calls, statuses, workers,
lookahead, the replan log and the truthful cache line "computed by the engine
at … in … ms · served from cache"), the full decision list with alternatives,
mission ids, and the timeline speed and trace toggles (folded behind "⋯" in
simple mode).

## Guided demo

`components/demoSteps.ts` builds the ten-step narrative live from one preset:
the scenario is assembled one disruption at a time with
`POST /api/scenario/load {scenario}` (same id/name/description/tags as the
preset, `disruptions` = the subset introduced so far), so each step adds
exactly one thing and the fully built scenario is byte-identical to the preset
(the backend's content-keyed result cache therefore answers instantly after
start-up warm-up). Steps: normal network → wildfire → airport closure →
medical emergency → essential cargo → the damage (do-nothing card) →
rule-based baseline → RUN NORTHSTAR AI (the *run moment*) → result card → why
card + "See the 100-scenario results" (parks the demo on the Research page
with a "Back to the demo" toast). The primary preset uses the fixed order
`WF-1, AF-1, ME-1, CG-1`; any other preset maps its disruptions in start order
into steps 2–5 (extras grouped into step 5, fewer steps when it has fewer
than four).

The **run moment** (`components/RunMoment.tsx`, also used by the panel
buttons) is an overlay over the map: five stages, named after the optimizer's
real phases in the order `NorthstarStrategy.plan()` runs them (read the
network state → feasibility table → CP-SAT model → solve → the simulator
validates the plan), advance with a live timer while the request is in flight
(one per ~350 ms, never beyond the last), then the truthful line ("Solved in …
ms · n solver calls", or, when `cached`, "This scenario was solved at start-up
by the same engine (… ms); nothing is recomputed now."), then a replay
of the real solver log from `replans[]` (one line per CP-SAT call, first 12),
then "See the result". While it is open the map behind it dims to 60 %
(`.cc-map.dimmed`, 300 ms); "See the result" lifts the dim and the NORTHSTAR
routes cross-fade in. Reduced motion shows everything at once.

While the guided demo is open in simple mode the right column shows only the
status tiles and the action stack (the demo card carries the result and why
cards) and the map's info panel stays hidden; they return when the demo exits
or parks. Advanced mode is unchanged.

## Map layers (`src/map`)

Base style (`style.ts`, all offline): ocean background · land (Natural Earth
countries) · Nunavut fill (provinces, filtered) · lakes · province borders ·
coastlines · a brighter Nunavut coastline · a client-built graticule
(meridians every 10°, parallels every 5°, 140–50° W, 50–85° N).
Overlays (`layers.ts`, added on style load, bottom to top): disruption discs
(inner disc with the dashed boundary, plus a softer outer disc at 1.35× radius
and 40 % of the opacity for the smoke/weather drift) · hub halos (soft circle
under hubs; danger-tinted when the hub is closed; teal for the selected
airport) · routes (normal / elevated risk / closed) · one solid **used-routes**
layer and one **flow** layer per strategy (`used-*`, `flow-*`, grey for the
baseline, teal for NORTHSTAR, dim grey for do-nothing; line geometry is
oriented in the direction the run actually flew the route, majority direction
when both) · click-hit layer · highlighted decision path (glow + core) ·
mission arrows · **aircraft trails** (the part of the current leg already
flown, rebuilt on every time tick from `aircraftPositionsAt`) · community
rings · airports. Aircraft, labels and mission icons remain DOM markers.

**Marker placement and label declutter** (`markers.ts`): labels sit to the
right of the dot; parked aircraft fan out in a row 19 px under it; mission
boxes (medevac cross, cargo box) sit up-left of it, centred at (−15, −22) px
so the box and its pulse ring clear the label row, and several missions at one
airport continue leftwards 25 px apart. `declutterLabels` measures the real
label widths, places hub labels first (always visible, never moved), then
tries each community label beside, just below and just above its dot and
keeps the first row that overlaps neither a placed label nor a reserved box —
the mission boxes and the parked-aircraft row of every airport, whose counts
`MapView` maintains and passes in — and hides the label when no row is free.
It runs on `moveend` and `zoom` and again whenever the mission set or the
parked-aircraft layout changes (the per-time-tick check compares a signature
of parked counts, so playback does not re-run it every frame).

**Map legend** (`MapLegend.tsx`): bottom-left of the map, stacked above the
info panel in one flex column (`.map-corner`) so neither covers the other or
the labels along the bottom (Sanikiluaq). It is collapsible from a
"Legend" button (`aria-expanded`, `aria-controls`, keyboard-operable),
expanded by default at ≥ 1440 px and collapsed below, remembered in
`localStorage` `northstar.legend`; while the info panel is open the legend
folds to its button and returns to the remembered state when the panel
closes.

The flow is a `line-dasharray` stepped through a 14-phase sequence at ~12 fps
by `flow.ts` (`requestAnimationFrame` with a time gate, no React state). It
runs only while a run is displayed and the tab is visible, never under
`prefers-reduced-motion`, and is disposed with the map. Switching the displayed
run only changes the opacity of the per-strategy layers, which MapLibre
transitions (500 ms; 0 under reduced motion), so Baseline ↔ NORTHSTAR reads as
a cross-fade; data-driven colours cannot be transitioned, which is why the used
routes are separate layers rather than a `state` property. In the
single-column layout (below 1280 px) or a map column taller than it is wide,
the initial fit uses the airports south of 72° N so Iqaluit, Rankin Inlet and
Cambridge Bay stay large; the wide layout keeps the full-network fit.

For screenshots and diagnostics the map view exposes `window.__northstarMap`
(the MapLibre instance) and `window.__northstarFlow` (`running`, `ticks`); the
application itself never reads them.

## Motion and reduced motion

Everything animated is quiet and has an off switch: `prefers-reduced-motion`
zeroes every CSS animation/transition and caps every animation at one
iteration (`base.css`, so the looping pulses end instead of cycling at
0.001 ms; the driver asserts `document.getAnimations()` has nothing running),
disables the landing
section reveals (`site/reveal.ts`, IntersectionObserver, once, also skipped when
the page is opened with an anchor), the hero stagger, the evidence count-up
(`useCountUp`), the launch-band aurora drift, the status-tile tick, the demo
step fade and the map flow loop; MapLibre paint transitions are created with
duration 0. The landing hero draws the Nunavut coastline (and neighbouring land,
fainter) behind the network loop from `/api/basemap/provinces`, projected with
the loop's own equirectangular fit (`site/coast.ts`; rings under 8 points are
dropped, the rest decimated to ≤ 4 000 + 2 000 points). Surfaces that float over
the map or the page (demo card, run moment, info panel, legend, scrolled site
header) use the same "arctic glass" (`rgba(14,21,31,0.86)` + 10 px backdrop
blur, ice border, inner top highlight) with a solid fallback under
`@supports not (backdrop-filter)`.

## Run

```
# terminal 1: backend (serves /api and, once built, the frontend itself at /)
cd backend && uv run uvicorn northstar.api.main:app --port 8000

# terminal 2: dev server with hot reload (proxies /api -> :8000)
cd frontend && npm install && npm run dev        # http://localhost:5173

# production build; the backend mounts frontend/dist at http://localhost:8000/
# (the mount is decided at backend start-up, so restart uvicorn after the first build)
npm run build                                    # tsc -b && vite build
npm run lint                                     # oxlint
```

All API calls use relative `/api/...` URLs, so the same bundle works behind the
Vite proxy (`vite.config.ts` → `server.proxy`) and when served by the backend.

## Offline design

- No external tiles, fonts, CDNs or telemetry. Fonts are bundled from
  `@fontsource` (IBM Plex Sans Condensed for display, IBM Plex Sans for body
  and UI, IBM Plex Mono for eyebrows, codes and data; all open licence) and
  served as same-origin woff2. The basemap is three Natural
  Earth GeoJSON layers fetched from `/api/basemap/{countries,provinces,lakes}`
  and styled as MapLibre fill/line layers in a local style object
  (`src/map/style.ts`). The style declares no `glyphs` or `sprite`, so MapLibre
  can never request fonts or icons; every label, aircraft and mission icon is a
  DOM marker in the system font stack.
- MapLibre's web worker is registered through Vite (`src/map/worker.ts`,
  `?worker&url`) so it is a bundled same-origin asset in dev and production.
- `scripts/demo_screenshots.mjs` fails loudly if the page makes any request to
  a host other than localhost.

## Structure

```
src/api/types.ts        TypeScript mirrors of every JSON shape the backend returns
src/api/client.ts       fetch wrapper (ApiError with status/error/detail), all endpoints
src/state/store.ts      one Zustand store: network, scenario, impact, runs, compare,
                        decisions, experiments, playback clock, selection, errors
src/lib/                time (minutes after 06:00 -> HH:MM), metric formatting and
                        censoring, derived status-at-time / aircraft positions,
                        humanize (human sentences for disruptions, missions, result
                        rows, trade-offs and the decision checklist; the compact generator
                        description and the experiment-row sentence), prefs (Advanced flag)
src/map/                MapView (imperative MapLibre updates from store subscriptions),
                        style (offline basemap, graticule), layers (routes, per-strategy
                        used/flow layers, halos, rings, disruption discs, mission arrows,
                        trails, highlight path), flow (dash-array animation loop), markers
                        (aircraft, labels with decluttering around hubs / missions / parked
                        rows, mission icons in slots), geo (great-circle interpolation,
                        graticule), InfoPanel, MapLegend (collapsible, remembered)
src/router.ts           hash router (parse, navigate, useRoute, titles)
src/components/         Header (app header + Advanced switch), Onboarding, ErrorBanner
                        (+DatasetError), StatusTiles, Timeline (simple/advanced),
                        simple mode: ScenarioSimple (+Happening), PresetCards, ActionStack,
                        ResultCard, WhyCard (+WhyPanel; "Alternatives considered" expands to a
                        table of every aircraft in the fleet with the optimizer's verdict and
                        reason, the non-candidates from the run's snapshot at decision time),
                        RunMoment;
                        advanced mode: ScenarioPanel, DisruptionForm, MissionList, RunPanel
                        (+RunStatus diagnostics), ComparePanel, DecisionsPanel;
                        DemoStepper (+demoSteps: plan builder and the ten steps)
src/site/               SiteHeader, SiteFooter, Home (+Section, Evidence, DataColumns),
                        NetworkLoop (+loopModel: projection, closures, cut-off and
                        reconnection paths; +coast: coastline paths), reveal (section
                        reveals, in-view flag, count-up), DataPage, AboutPage, copy
src/views/              CommandCenter, Research (+research/Charts: strips, W/L/T bar, solver
                        buckets; +research/Explorer: scenario table, Open in simulator), ResponsibleAI
src/styles/             tokens (colour, type scale, fonts), base, header, command, panels,
                        map, timeline, demo, research, responsible, site, onboarding
public/preview/         command-center.png (copy of docs/screenshots/step-07.png for the teaser)
scripts/demo_screenshots.mjs   Playwright: landing, pages, onboarding, preset cards, guided demo
                               (incl. the run moment), simple/advanced mode, failure states,
                               the Research story sections and the Open-in-simulator round trip,
                               the 1280 px layout, reduced motion, the accessibility floor,
                               keyboard tab walks and the contrast sample
scripts/perf_flow.mjs          Playwright: fps with flow + trails at 2× playback; flow stops when no run
```

## Behaviour notes

- Times are simulation minutes after 06:00 local and are displayed as HH:MM;
  the timeline runs 06:00 → 06:00 (+1d) in 30-minute steps. Aircraft positions
  between snapshots are interpolated along the great circle of the leg in
  flight (`trace.legs`), so playback is smooth at any speed.
- Network state badge: NORMAL (no disruptions) → WARNING (disruptions defined,
  nothing analysed) → DISRUPTED (do-nothing impact or baseline displayed) →
  OPTIMIZED (NORTHSTAR plan displayed).
- RUN NORTHSTAR AI runs the baseline first if it has not been run, so the
  Before/After panel and the `vs_baseline` fields in decisions are always
  populated. The "Do nothing" column comes from `/api/scenario/impact`, which
  is fetched automatically before the first run. Every run result carries
  `cached`, `compute_ms` and `computed_at`; the interface states when the
  computation really happened instead of pretending to wait.
- Failure states: backend unreachable → red banner with Retry, controls
  disabled, last state kept (health is polled every 5 s and the UI re-boots
  when the backend returns); 503 dataset missing → full-screen message with the
  file name; NO_FEASIBLE_SOLUTION → red state card with per-mission reasons;
  TIMEOUT/PARTIAL → amber "not proven optimal" badge; unserved missions → red
  rows with the reason; `/api/experiments/latest` 404 → empty state with the
  command to run the experiment.

## Screenshots

With the backend on :8000 and the dev server running:

```
npm i -D playwright && npx playwright install chromium   # once
node scripts/demo_screenshots.mjs                        # BASE_URL=http://localhost:5174 if the port differs
```

Writes, into `docs/screenshots/`: `hero-coast.png` (hero at 1440 with the
coastline, DISRUPTED phase), `site-scrolled.png` (landing at the method section
under the glass header), `home-hero.png`, `home-problem.png`, `home-how.png`,
`home-evidence.png`, `home-data.png`, `home-mobile-390.png` (full page at
390×844), `data.png`, `about.png` (full page), `onboarding.png`,
`app-header.png`, `presets.png` (simple mode, healthy), `step-01.png …
step-10.png` plus `step-08-run.png` (the run moment during the solver-log
replay) and `map-detail.png` (step 9, one zoom level in on the Kivalliq region:
flow, trails, disruption boundary, hub halos), `research.png` (full page,
reached through the demo's last button), `simple-mode.png`, `result-card.png`,
`why-card.png`, `run-moment.png`, `advanced-mode.png`, `responsible-ai.png`,
`command-center.png`, `research-empty.png`, `backend-down.png` and
`narrow-1024.png`; plus (V4) `research-story.png` (question, method and
headline in one tall clip), `research-strips.png`, `research-losses.png`,
`research-solver.png`, `research-explorer.png` (sorted worst-first by the
first metric), `research-open-sim.png` (the command centre right after
"Open in simulator"), `data-page.png` (the provenance table),
`about-page.png` (the limitations list) and `why-alternatives.png` (the why
card with every candidate aircraft); plus (V5) `narrow-1280.png` (demo step 9
at 1280 × 900, the card docked in the 440 px column), `narrow-1280-why.png`
(step 10 at 1280 × 900) and `reduced-motion.png` (step 9 on a page opened
with `prefers-reduced-motion: reduce`). It prints the wall time of the guided
demo from step 1 to step 10, checks that the landing has no horizontal
overflow at 390, 768, 1440 and 1600 px (and the simulation at 1024 and 1280),
that no request leaves localhost, that every strip draws one tick per
scenario, that the four solver buckets sum to the total, that the explorer
opens on six columns including reroutes ("Resilience 6" / "All 10"), that
sorting the explorer puts a loss first when losses exist, and that "Open in
simulator" really loads the generated scenario (header name, network state,
`/api/scenario` id and disruption count, the compacted description and the
"Scenario *n* of the *N*-scenario experiment" sentence) before resetting the
session through the UI so the demo that follows starts from a healthy network.

V5 also checks, with no extra dependency:

- **Accessibility floor** (`a11yAudit`, on Home, Data, About, Research and
  the simulation in simple mode after a NORTHSTAR run): every rendered
  `button` / `a` has an accessible name (text, `aria-label` or
  `aria-labelledby`), every `input` / `select` / `textarea` is labelled,
  exactly one `h1`, heading levels never skip (the panel eyebrows of the
  command centre are `h2` elements styled as eyebrows for this reason; the
  About steps section has a visually hidden `h2`), every `img` has `alt`,
  every `svg[role=img]` and every `[role=dialog]` is labelled. Elements inside
  `[hidden]` or `aria-hidden` subtrees do not count, so the kept-mounted
  command centre never leaks into the site pages.
- **Keyboard** (`tabWalk`): Tab from the top of the simulation page must
  reach, in this order, the header demo button → a preset card → its
  "Guided demo with this scenario" link → the legend toggle → Start guided
  demo → RUN NORTHSTAR AI → the timeline play button → the scrubber (healthy
  network), and the header button → the docked card's Back → RUN NORTHSTAR AI
  (step 8) / Next (step 9) → play during the demo; the preset buttons, the
  Advanced switch (its track carries the ring for the hidden checkbox), the
  legend toggle, RUN, Back, Next and the scrubber must show a focus ring
  (`:focus-visible` with a non-zero outline). The walk is printed.
- **Contrast** (`contrastAudit`): every rendered text under 14 px on the
  audited pages is checked against its composited CSS background (WCAG 2.x
  relative luminance; texts over gradients or the map canvas are skipped as
  unknown) and must reach 4.5:1, and the `--ink-3` token is checked against
  `--bg-0`, `--bg-1` and `--bg-2`. V5 raised `--ink-3` from `#6c7d8e` (4.63 /
  4.33 / 3.97) to `#7a8b9c` (5.60 / 5.24 / 4.80).
- **Layout at 1280** (`narrowShot`): the card is docked, the right column is
  440 px, nothing in it is wider than the column, no result label, tile label
  or button text is clipped, and there is no horizontal overflow.
- **Reduced motion**: on the reduced-motion page the flow loop never ran
  (`window.__northstarFlow.running === false`, `ticks === 0`) and
  `document.getAnimations()` has no running animation outside MapLibre's
  own containers.
- **Map declutter at step 9**: no mission marker touches a hub label, and no
  visible community label touches a hub label, a mission marker or a parked
  aircraft; the legend is expanded by default at 1600, collapses on Enter,
  stores `northstar.legend`, expands on Space, and no longer covers the
  Sanikiluaq label.

`BASE_URL=http://localhost:8000 node scripts/perf_flow.mjs` measures the
achieved frame rate with the NORTHSTAR run displayed and playback at 2× (flow +
trails) for 5 s and checks that the flow loop stops once no run is displayed.
Both scripts ask Chromium for the real GPU on macOS (ANGLE/Metal); plain
headless Chromium renders WebGL in software (SwiftShader), which is not
representative for frame rates and can leave a band of the map canvas
unpainted in tall captures (visible in `narrow-1024.png` when the driver runs
without a GPU).
