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
