# NORTHSTAR AI — Live Demo Script (target 4:30, hard stop 5:00)

Setup: Wi-Fi off. `scripts/demo.sh` running. Browser at http://localhost:8000/ showing
the healthy network. Demo Mode enabled. Primary preset: *Kivalliq wildfire smoke +
medevac + cargo*. Backups: Baffin blizzard, Kitikmeot medevac + failure.

Numbers in brackets are what the primary preset produced during rehearsal on the
development machine; read the live numbers off the screen, never from this page.

| Time | Screen (Demo Mode step) | Say |
|------|--------------------------|-----|
| 0:00 | Step 1 — healthy network | "Nunavut has 25 communities and not one road between them. Every patient transfer, every pallet of food, every trip out goes by air. When a hub airport closes, communities are cut off. NORTHSTAR AI asks one question: can AI-assisted optimization make this network more resilient during disruptions? On screen: real airports and runways from public data; a synthetic fleet of ten aircraft and a synthetic daily schedule, all labelled as such." |
| 0:40 | Step 2 — trigger disruption | "It's 07:00. Wildfire smoke closes Rankin Inlet, the Kivalliq hub, and Whale Cove for ten hours. The hub's ATR is already grounded. At 08:00 Chesterfield Inlet calls a priority-one medevac. At 08:30 Coral Harbour needs 900 kg of medical supplies. Four things at once." |
| 1:05 | Step 3 — impact before intervention | "Do nothing, and this is the day: [2] communities are still without air service at the end of the day, the medevac is never flown, [5] flights are cancelled. Those numbers come from the simulator, not a slide." |
| 1:30 | Step 4 — baseline response | "First, a simple rule-based dispatcher: scheduled flights keep their own aircraft, emergencies get the nearest free compatible aircraft, shortest open route, try again when an aircraft frees up. It is transparent and it is not tuned. Watch it play out." *(let the trace run ~10 s)* "It serves the medevac in [240] minutes, but communities spend [88] hours cut off, [3] are still cut off at the end of the day and [8] flights are cancelled." |
| 2:05 | Step 5 — RUN NORTHSTAR AI | *(press the button)* "NORTHSTAR is a constraint-programming optimizer, Google OR-Tools CP-SAT. Every time something changes it re-solves: which aircraft flies which mission, in what order, on which route, subject to range, runway length, capacity, closures and availability, with an explicit weighted objective. Solved in about a second." |
| 2:30 | Step 6 — animate | *(let the trace run ~10 s)* "See the difference: aircraft are pre-positioned before missions are released, and service to the Kivalliq communities is restored from an alternate hub instead of waiting." |
| 2:55 | Step 7 — before vs after | "Same disruption, same fleet, same metrics function. Communities disconnected at end of day: [3 → 0]. Disconnected-community hours: [88 → 53]. Cancelled flights: [8 → 0]. Mean passenger delay: [392 → 168] minutes. Recovery: [never within the day → 16 hours]. And the trade-off, in red: the cargo arrives [3.5 hours] later than under the baseline, because NORTHSTAR restored the Kivalliq communities' service first. Whether that is the right call is a policy decision; the weights are on screen and can be switched to Medical-first or Connectivity-first." |
| 3:30 | Step 8 — explain one decision | *(expand the medevac decision)* "Every decision is explained from the optimizer's own data: why this aircraft — priority, rank by response time, runway and range checks — which alternatives were rejected and why, and what it cost someone else. No language model writes this." |
| 3:55 | Step 9 — research results | "One scenario proves nothing, so we generated 100 random disruption days from a fixed seed and ran each one twice. NORTHSTAR won on [read the wins/losses for medical response and disconnected hours]. It lost on [read the tradeoffs list]. The raw CSV is in the repository." |
| 4:25 | Step 10 — Responsible AI | "NORTHSTAR is a research simulation. It recommends; a human decides. Real geography, synthetic operations, clearly separated. It is not approved for flight operations or medical decisions, and nothing here shows it would generalise to a real airline. What it shows is that measurable, explainable optimization can help keep Northern communities connected, and that the trade-offs can be made visible instead of hidden." |

## If something goes wrong
- Backend banner appears: restart `scripts/demo.sh`; the page reconnects.
- NORTHSTAR shows an amber "not proven optimal" badge: say so, it is honest; continue.
- The primary preset behaves unexpectedly: use the backup selector in Demo Mode; the Research tab carries the aggregate story regardless.
- Total failure: `docs/screenshots/step-01.png` … `step-10.png` with the same narration.

## Questions judges may ask
- *Where is the AI?* Constraint optimization (search + propagation over a declared model) is the AI; there is deliberately no ML model because no defensible labelled dataset exists offline. See `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md` §10.
- *Is the baseline a strawman?* It retries, keeps scheduled aircraft when possible, and uses the same feasibility rules; it represents "dispatch on demand", the way small operators actually work. The gap is to that rule set, not to expert humans.
- *Why do you count unserved missions at the horizon end?* Conservative, identical for both strategies, and the censored counts are shown next to every average.
- *What would it take to use this for real?* Section 9 of `docs/RESPONSIBLE_AI.md`.
