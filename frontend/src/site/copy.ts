export const FALLBACK_DISCLAIMER = 'NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for real-world flight operations, medical decisions, or aviation dispatch.'
/** The exact experiment command; the Research page fills n and seed from the summary it is showing. */
export const runExperimentCmd = (n = 100, seed = 42) => `cd backend && uv run python ../experiments/run_experiments.py --n ${n} --seed ${seed}`
export const RUN_EXPERIMENT_CMD = runExperimentCmd()
export const REBUILD_CMD = 'python3 scripts/build_datasets.py'

export const REAL_DATA: { what: string; source: string }[] = [
  { what: 'Airport locations, codes and elevations', source: 'OurAirports, public domain' },
  { what: 'Runway length and surface', source: 'OurAirports; two strips from a secondary source, flagged' },
  { what: '2021 Census population of every community', source: 'Statistics Canada, open licence' },
  { what: 'Basemap geometry', source: 'Natural Earth, public domain' },
]
export const SYNTHETIC_DATA: { what: string; source: string }[] = [
  { what: 'Aircraft fleet, bases and availability', source: 'real types, invented composition' },
  { what: 'Daily schedule and passenger counts', source: '' },
  { what: 'Medical emergencies and cargo requests', source: '' },
  { what: 'Closures, weather and wildfire events', source: '' },
  { what: 'Operating-cost index', source: '' },
]

export type DataKind = 'real' | 'synthetic' | 'derived'
export interface ProvenanceRow {
  dataset: string
  /** Key of /api/network whose length gives the count shown, or null. */
  countOf: 'airports' | 'communities' | 'routes' | 'aircraft' | 'schedule' | null
  countUnit: string
  kind: DataKind
  source: string
  licence: string
  usedFor: string
}
/** One row per dataset; facts from docs/DATA_PROVENANCE.md, counts from /api/network. */
export const PROVENANCE_ROWS: ProvenanceRow[] = [
  { dataset: 'Airports: identity, ICAO/IATA codes, coordinates, elevation', countOf: 'airports', countUnit: 'airports', kind: 'real', source: 'OurAirports airports.csv, retrieved 2026-09-24', licence: 'Public domain (Unlicense)', usedFor: 'Map, graph nodes, great-circle distances' },
  { dataset: 'Runways: longest open runway length and surface', countOf: null, countUnit: '', kind: 'real', source: 'OurAirports runways.csv for 26 of 28 airports; Grise Fiord and Kimmirut lengths and Whale Cove and Chesterfield Inlet surfaces from Wikipedia infoboxes citing the Canada Flight Supplement (secondary source, flagged per airport)', licence: 'Public domain; CC BY-SA for the Wikipedia text', usedFor: 'Runway-compatibility constraint per aircraft type' },
  { dataset: 'Communities: 2021 Census population', countOf: 'communities', countUnit: 'communities', kind: 'real', source: 'Statistics Canada, 2021 Census of Population, table 98-10-0002-01 (census subdivisions)', licence: 'Statistics Canada Open Licence', usedFor: 'Display and optional priority weighting; not used by any algorithm by default' },
  { dataset: 'Basemap: country, province/territory and lake polygons', countOf: null, countUnit: '', kind: 'real', source: 'Natural Earth 1:50m vectors, filtered to North America / Canada', licence: 'Public domain', usedFor: 'Offline map background, the coastline behind the landing loop' },
  { dataset: 'Route distances', countOf: null, countUnit: '', kind: 'derived', source: 'Great-circle (haversine) distance between the real airport coordinates', licence: 'Derived from public-domain coordinates', usedFor: 'Leg times, range checks, distance flown' },
  { dataset: 'Route network: which airports are linked', countOf: 'routes', countUnit: 'undirected routes', kind: 'synthetic', source: 'Hub-and-spoke simplification informed by publicly advertised Northern airline networks; not an official schedule or airway structure', licence: 'Project assumption', usedFor: 'Graph edges, open-path search' },
  { dataset: 'Fleet: composition, home bases, availability, cost index', countOf: 'aircraft', countUnit: 'aircraft', kind: 'synthetic', source: 'Real aircraft types (Twin Otter, ATR 42, Dash 8-300, King Air 350, PC-12, 737-200 combi) with rounded public specifications; composition and basing invented', licence: 'Project assumption', usedFor: 'Range, capacity, runway and availability constraints' },
  { dataset: 'Daily passenger schedule and passenger counts', countOf: 'schedule', countUnit: 'scheduled legs', kind: 'synthetic', source: 'Invented one-day schedule so the network has a normal state to disrupt', licence: 'Project assumption', usedFor: 'Scheduled missions, service-disconnection and cancellation metrics' },
  { dataset: 'Demand and disruptions: medical emergencies, cargo requests, closures, weather, wildfire', countOf: null, countUnit: '', kind: 'synthetic', source: 'Five hand-written presets and the seeded scenario generator (numpy default_rng, master seed × 1000 + i)', licence: 'Project assumption', usedFor: 'Scenarios for the demo and the 100-scenario experiment' },
]

/** Sourced from DATA_AND_EXPERIMENT_METHODOLOGY.md §10, DATA_PROVENANCE.md §4 and RESPONSIBLE_AI.md §6–7. */
export const NOT_DONE: { t: string; p: string }[] = [
  { t: 'No real airline data', p: 'The fleet, its bases, the route list, the daily schedule and the passenger counts are invented. Nothing here describes any airline’s operations.' },
  { t: 'No real medevac or patient records', p: 'Medical emergencies are generated with a priority (1–3) as an input. No personal data of any kind is used or generated.' },
  { t: 'No machine-learning risk model', p: 'Route risk is a transparent score. A learned model (Random Forest, XGBoost) was left out because no defensible labelled dataset of route disruptions is available offline; it would only be added with a documented label source, a time-based split, and precision, recall and calibration reported alongside accuracy.' },
  { t: 'No live data feeds', p: 'No weather, wildfire hotspot or ADS-B feed is used. The data contract has weather_risk and wildfire_risk fields per airport so a public feed could populate them later without changing the simulation.' },
  { t: 'No interface to any real system', p: 'The simulator, the optimizer and this interface run on one machine, offline. None is planned.' },
]

/** Methodology §3.6 (simplifications) and §9 (threats to validity). */
export const LIMITATIONS: string[] = [
  'No crew duty limits, no fuel planning beyond range, no weather forecast, no stochastic execution noise, no airport capacity limits, no night restrictions, no maintenance schedules.',
  'Leg time is great-circle distance over cruise speed plus a fixed 30-minute turnaround, rounded up to 30-minute steps; no wind, climb or descent profile.',
  'Synthetic schedule, fleet and demand may not reflect real operations.',
  'The baseline is one reasonable manual dispatch heuristic; real dispatchers are more capable, so the gap to NORTHSTAR is an upper bound on the improvement over a simple rule set, not over human experts.',
  'The optimizer optimises the same weighted quantities the metrics measure; the sensitivity runs and per-metric trade-offs exist to make this visible.',
  'Deterministic execution ignores real-world uncertainty; a plan that is good under certainty may be brittle.',
  'Results are for one 28-airport network; nothing here shows they generalise.',
]

/** Responsible AI §9. */
export const BEFORE_REAL_USE: string[] = [
  'Validated operational data in place of the synthetic fleet, schedule and demand.',
  'Weather and forecast integration.',
  'Uncertainty-aware planning instead of a deterministic day.',
  'Crew and maintenance constraints.',
  'Regulatory review.',
  'Evaluation with the dispatchers, medical staff and communities who would be affected.',
]

/** How to read the numbers on the Research page (methodology §4 and §7). */
export const GLOSSARY: { t: string; d: string }[] = [
  { t: 'Disconnected community', d: 'A community is disconnected at time t if its airport is closed or no open path exists to any hub that some aircraft in the fleet can fly (structural), or a scheduled inbound flight was disrupted and no passenger or cargo flight has landed there since (service). The two are counted as a union, no double-counting; structural disconnection is identical for both strategies by construction.' },
  { t: 'Disconnected-community hours', d: 'The sum over communities of the hours spent disconnected during the 24-hour day.' },
  { t: 'Censoring at 24 h', d: 'A mission not served by the end of the horizon is not dropped: it enters every average at the horizon-end value, for both strategies, and the number of censored missions is reported next to the average. This understates how bad an unserved mission is.' },
  { t: 'Wins / losses / ties', d: 'Per metric, the number of scenarios in which NORTHSTAR did better, worse, or the same as the baseline. Ties use the runner’s tolerance: exact for counts, 1 minute for times, 0.5 km for distance.' },
  { t: 'Sign test', d: 'A two-sided exact test on the non-tied pairs: if the two dispatchers were equally good, wins and losses would be equally likely. No claim of significance is made where p ≥ 0.05.' },
  { t: 'Improvement %', d: '(baseline mean − NORTHSTAR mean) / baseline mean for lower-is-better metrics, signed so that positive is better for NORTHSTAR. It can be large when the baseline mean is small, so read it next to the means and the wins.' },
  { t: 'Do nothing', d: 'The published schedule flown with no response to events at all, on the same scenarios; a reference, not a strategy.' },
]
