export const FALLBACK_DISCLAIMER = 'NORTHSTAR AI is a research simulation and decision-support prototype. It is not approved for real-world flight operations, medical decisions, or aviation dispatch.'
export const RUN_EXPERIMENT_CMD = 'cd backend && uv run python ../experiments/run_experiments.py --n 100 --seed 42'
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
