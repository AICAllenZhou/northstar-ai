# NORTHSTAR AI — Live Demo Script (target 4:30, hard stop 5:00)

Written for the presenter. Read the live numbers off the screen; the numbers in brackets are
what the primary scenario produced during rehearsal on the development machine and exist only
so you know what to expect.

## Setup (before the judges arrive)

1. Wi-Fi off. From the repository root: `scripts/demo.sh`. The server precomputes every preset
   with the same engine the button uses; the terminal prints `ready in N s: 5 presets precomputed`
   (about 40 s) and the five scenario cards in the command center show *Precomputed ✓*. Do not
   start before they do.
2. Browser at http://localhost:8000/ — the landing page. Scroll once to the bottom and back so
   you have seen it; then click **Enter the command center**.
3. On first visit a welcome dialog offers **Start guided demo**. Leave it open; that is your
   first click. If you have opened the page before, the button is in the header.
4. Leave the **Advanced** switch (top right) off. Everything the judges need is in Simple mode;
   Advanced is for questions.

The guided demo is one button per step. Every step also changes the map, so let the map do the
talking: point at what moved.

## The click path and what to say

| Time | Step (title on the card) | Click | Say |
|------|--------------------------|-------|-----|
| 0:00 | 1 · Normal network | **Start guided demo** | "This is Nunavut. Twenty-five communities, no road between any two of them. Every patient, every pallet of food, every trip out goes by air. On a normal day ten aircraft fly twenty-six scheduled flights. The airports, runways and populations are real public data; the fleet and the schedule are synthetic and labelled as such." |
| 0:30 | 2 · Wildfire | Next | "Seven in the morning. Wildfire smoke closes Rankin Inlet, the Kivalliq hub, and Whale Cove until five in the evening. The red dashed lines are routes nobody can fly." |
| 0:45 | 3 · Airport closure | Next | "The hub is closed and its own aircraft, an ATR 42, is grounded for maintenance. Nine aircraft remain for the whole territory." |
| 1:00 | 4 · Medical emergency | Next | "Eight o'clock. Chesterfield Inlet, population about four hundred, calls a priority-one medical evacuation. The nearest hospital hub is the one that just closed." |
| 1:15 | 5 · Essential cargo | Next | "Half past eight. Coral Harbour needs nine hundred kilograms of medical supplies by half past four. Two urgent missions, one closed hub, one aircraft fewer. This is an ordinary bad day in the North." |
| 1:30 | 6 · The damage | Next | "If nobody reacts, this is the day: at noon [five] communities have no air service, [two] are still cut off at midnight, the medevac is never flown, the cargo never arrives, [five] of twenty-six flights are cancelled. These numbers come from the simulator, not from a slide." |
| 1:55 | 7 · Rule-based baseline | Next *(trace plays by itself)* | "First, a simple dispatcher with rules you can read in one sentence: scheduled flights keep their aircraft, emergencies get the nearest free compatible aircraft, shortest open route, try again when one frees up. It is transparent and it is not tuned to lose. It flies the medevac in [four hours], but [three] communities are still cut off at the end of the day, communities spend [88] hours without service, and [eight] flights are cancelled." |
| 2:25 | 8 · Run NORTHSTAR AI | **RUN NORTHSTAR AI** | "NORTHSTAR is constraint optimization, Google OR-Tools CP-SAT. Every time something changes it re-solves the whole picture: which aircraft flies which mission, in what order, on which open route, under range, runway, capacity and closure constraints." *(the panel shows the solver log)* "Twenty-two solver calls, every one proven optimal, about a second of solving. The highlighted line says when this exact result was computed; in the demo it is retrieved from the start-up run so nobody waits, and the same button on a custom scenario solves live." |
| 2:55 | 9 · Result | **See the result** | "Same disruption, same fleet, same metric function. Communities still cut off at the end of the day: [three to zero]. Hours without service: [88 to 53]. Cancelled flights: [eight to zero]. And the honest part, in red: the cargo arrives [three and a half hours] later than under the baseline, because NORTHSTAR restored service to the Kivalliq communities first. Whether that is the right priority is a policy choice; the weights are declared and can be switched." |
| 3:30 | 10 · Why, and the evidence | Next | "Every reason on this checklist is a field from the optimizer's own feasibility table: priority one, the earliest-response compatible aircraft, runway long enough, within range, the route it took, and the [six] alternatives it rejected and why. No language model writes any of this." |
| 3:55 | Research page | **See the 100-scenario results** | "One scenario proves nothing. So we generated a hundred random disruption days from a fixed seed and ran each one twice. Hours without service: NORTHSTAR better in [88], worse in [2]. Medical response: better in [24], worse in [7], tied in [69], because response time is often limited by distance, not by planning. Passenger delay: better in [96], worse in none. And one metric where the baseline wins: NORTHSTAR reassigns aircraft about three times as often, baseline better in [65]. The CSV, every scenario and the seed are in the repository." |
| 4:25 | Closing (stay on Research, or click **Back to the demo**) | — | "NORTHSTAR is a research simulation. It recommends; a human decides. Real geography, synthetic operations, kept apart on every screen. It is not approved for flight operations or medical decisions, and nothing here proves it would work for a real airline. What it shows is that measurable, explainable optimization can help keep Northern communities connected, and that the trade-offs can be shown instead of hidden." |

## If something goes wrong

- **A red banner says the backend is down.** Restart `scripts/demo.sh`; the page reconnects by
  itself and the demo resumes where it was (the header button says *Demo running · exit*).
- **NORTHSTAR shows PARTIAL or a time-out badge.** Say so, it is honest; the result is still
  feasible and the comparison is still valid. It has never happened on the presets.
- **The primary scenario behaves unexpectedly.** The scenario menu on the demo card switches to a
  backup preset (Arctic weather, Medical emergency + aircraft failure); the ten steps work the same
  way. The Research page carries the aggregate story regardless.
- **A step's card says an action is required.** Do what it says (usually *press RUN NORTHSTAR AI*
  or *Back*); the demo never skips a computation.
- **Total failure.** `docs/screenshots/step-01.png` … `step-10.png` with the same narration.

## Questions judges may ask

- *Was that result precomputed?* Yes, and the screen says so. At start-up the server runs every
  preset once with the same engine (do nothing, baseline, NORTHSTAR) and caches the result; the run
  panel names the UTC time and duration of that computation. Switch on **Advanced**, add a
  disruption with *Custom scenario*, and press RUN: that one is solved live, usually in one to ten
  seconds. Nothing in the experiment (100 scenarios) uses any cache.
- *Where is the AI?* Constraint optimization: a declared model of aircraft, missions, routes and
  rules, searched by CP-SAT with propagation and learning. There is deliberately no machine-learned
  model because no defensible labelled dataset exists offline. See
  `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md` §10.
- *Is the baseline a strawman?* It keeps scheduled aircraft on their flights, retries, and uses the
  same feasibility rules as NORTHSTAR. Its first version was worse than doing nothing, so it was
  rewritten to protect the schedule before any experiment was run. The gap is to that rule set, not
  to expert human dispatchers.
- *Why does the cargo arrive later under NORTHSTAR?* Because the Balanced profile weights community
  connectivity above cargo lateness once the deadline is missed anyway. The Research page shows the
  same trade-off across a hundred scenarios (reroutes), and the policy profiles exist to make the
  choice visible.
- *Why count unserved missions at the horizon end?* It is conservative, identical for both
  strategies, and the censored counts are printed next to every average.
- *What would it take to use this for real?* Section 9 of `docs/RESPONSIBLE_AI.md`.
- *Do the weights actually matter?* Yes. If there is time: load *Medical emergency + aircraft
  failure*, run NORTHSTAR with **Balanced**, then switch the profile to **Medical-first** in
  Advanced mode and run again. Same scenario, same fleet, different declared priorities, a different
  recommendation. Read the two medical response times and the disconnected-community hours off
  the ten-metric table; do not quote numbers from memory.
