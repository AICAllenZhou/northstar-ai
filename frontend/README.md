# NORTHSTAR AI — frontend

React 19 + TypeScript + MapLibre GL 6 + Recharts 3 + Zustand 5, built with Vite.
A single-page "command center" for the NORTHSTAR aviation-resilience simulation.
Everything runs offline against the local FastAPI backend.

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

- No external tiles, fonts, CDNs or telemetry. The basemap is three Natural
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
src/components/         Header, ErrorBanner (+DatasetError), StatusTiles, ScenarioPanel,
                        DisruptionForm, MissionList, RunPanel, ComparePanel,
                        DecisionsPanel, Timeline, DemoStepper (+demoSteps)
src/views/              CommandCenter, Research (+research/Charts), ResponsibleAI
src/styles/             tokens (colour semantics), base, header, command, panels,
                        map, timeline, demo, research, responsible
scripts/demo_screenshots.mjs   Playwright: drives Demo Mode, saves docs/screenshots/*.png
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

Writes `docs/screenshots/step-01.png … step-10.png`, `research.png`,
`responsible-ai.png`, `command-center.png`, `research-empty.png`,
`backend-down.png` and `narrow-1024.png`.
