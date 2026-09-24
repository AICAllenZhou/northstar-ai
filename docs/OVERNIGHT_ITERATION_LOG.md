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
