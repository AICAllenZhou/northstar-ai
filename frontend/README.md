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
| `#/research` | Research results | site header |
| `#/data` | Data and provenance (real vs synthetic, dataset sidecars from `/api/network.metadata`) | site header |
| `#/about` | About the technology, Responsible AI (`#/about#responsible-ai`), credits | site header |

Hash routing survives the static host (the backend serves `index.html` at `/`
and the hash never reaches the server), so every deep link reloads correctly.
The store keeps the legacy `view` field for the demo steps; `setView()` maps
`command` / `research` / `responsible` to the routes above.

On the first visit to `#/simulation` in a browser session a welcome dialog
offers "Start guided demo" or "Explore on my own" (`sessionStorage`
`northstar.onboarded`); `#/simulation?demo=1` skips it.

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
                        censoring, derived status-at-time / aircraft positions
src/map/                MapView (imperative MapLibre updates from store subscriptions),
                        style (offline basemap), layers (routes, airports, rings,
                        disruption circles, mission arrows, highlight path), markers
                        (aircraft, labels with decluttering, mission icons), geo
                        (great-circle interpolation), InfoPanel, MapLegend
src/router.ts           hash router (parse, navigate, useRoute, titles)
src/components/         Header (app header), Onboarding, ErrorBanner (+DatasetError),
                        StatusTiles, ScenarioPanel, DisruptionForm, MissionList, RunPanel,
                        ComparePanel, DecisionsPanel, Timeline, DemoStepper (+demoSteps)
src/site/               SiteHeader, SiteFooter, Home (+Section, Evidence, DataColumns),
                        NetworkLoop (+loopModel: projection, closures, cut-off and
                        reconnection paths), DataPage, AboutPage, copy
src/views/              CommandCenter, Research (+research/Charts), ResponsibleAI
src/styles/             tokens (colour, type scale, fonts), base, header, command, panels,
                        map, timeline, demo, research, responsible, site, onboarding
public/preview/         command-center.png (copy of docs/screenshots/step-07.png for the teaser)
scripts/demo_screenshots.mjs   Playwright: landing, pages, onboarding, Demo Mode, failure states
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
  is fetched automatically before the first run.
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

Writes, into `docs/screenshots/`: `home-hero.png`, `home-problem.png`,
`home-how.png`, `home-evidence.png`, `home-data.png`, `home-mobile-390.png`
(full page at 390×844), `data.png`, `about.png` (full page), `onboarding.png`,
`app-header.png`, `step-01.png … step-10.png`, `research.png` (full page),
`responsible-ai.png`, `command-center.png`, `research-empty.png`,
`backend-down.png` and `narrow-1024.png`. It also checks that the landing has no
horizontal overflow at 390, 768 and 1600 px and that no request leaves localhost.
