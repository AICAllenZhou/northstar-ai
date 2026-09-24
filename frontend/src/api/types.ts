// Mirrors the JSON shapes served by the FastAPI backend (northstar/api/main.py).
// Times are minutes after 06:00 local unless a field name says otherwise.

export interface Airport {
  id: string
  iata: string
  name: string
  community_name: string
  region: string
  lat: number
  lon: number
  elevation_m: number | null
  runway_length_m: number
  runway_surface: 'paved' | 'gravel' | 'unknown'
  is_medical_hub: boolean
  is_cargo_hub: boolean
  is_passenger_hub: boolean
  hub_note: string
  base_weather_risk: number
  base_wildfire_risk: number
  data_flags: string[]
}

export interface Community {
  id: string
  name: string
  airport_id: string
  region: string
  lat: number
  lon: number
  population_2021: number | null
  priority_weight: number
}

export type AircraftRole = 'medevac' | 'passenger' | 'combi' | 'utility'

export interface Aircraft {
  id: string
  type: string
  callsign: string
  home_airport_id: string
  range_km: number
  capacity_people: number
  cargo_capacity_kg: number
  min_runway_length_m: number
  gravel_capable: boolean
  speed_kmh: number
  cost_index_per_km: number
  role: AircraftRole
}

export interface Route {
  id: string
  origin_airport_id: string
  destination_airport_id: string
  distance_km: number
  corridor: string
  base_risk: number
}

export interface ScheduleLeg {
  id: string
  aircraft_id: string
  origin_airport_id: string
  destination_airport_id: string
  departure_min: number
  scheduled_arrival_min: number
  departure_local: string
  passengers: number
  distance_km: number
}

export interface NetworkResponse {
  airports: Airport[]
  communities: Community[]
  aircraft: Aircraft[]
  routes: Route[]
  schedule: ScheduleLeg[]
  hubs: { medical: string[]; cargo: string[]; passenger: string[] }
  metadata: Record<string, unknown>
  disclaimer: string
  step_min: number
  clock_start: string
}

export interface Preset {
  id: string
  name: string
  description: string
  disruption_count: number
  tags: string[]
}

export interface PolicyWeights {
  w_medical_per_min: Record<string, number>
  w_cargo_late_per_min: number
  w_cargo_time_per_min: number
  w_passenger_late_per_min: number
  w_connectivity_per_min: number
  pen_unserved: Record<string, number>
  w_distance_per_km_index: number
  w_risk: number
  w_reroute: number
  risk_path_lambda: number
}

export interface Policy {
  id: string
  name: string
  description: string
  weights: PolicyWeights
}

export type DisruptionType =
  | 'airport_closure'
  | 'wildfire'
  | 'severe_weather'
  | 'aircraft_failure'
  | 'medical_emergency'
  | 'essential_cargo_request'

export interface Disruption {
  id: string
  type: DisruptionType
  target_ids: string[]
  center_lat: number | null
  center_lon: number | null
  radius_km: number | null
  severity: number
  start_min: number
  duration_min: number
  params: Record<string, unknown>
  label: string
}

/** Body for POST /api/scenario/disruptions (id optional; backend assigns one). */
export type DisruptionInput = Partial<Omit<Disruption, 'type'>> & { type: DisruptionType }

export interface Scenario {
  id: string
  name: string
  description: string
  seed: number | null
  horizon_min: number
  step_min: number
  disruptions: Disruption[]
  policy_id: string
  tags: string[]
}

export interface DisruptionEffect {
  id: string
  type: DisruptionType
  label: string
  start_min: number
  end_min: number
  severity: number
  target_ids: string[]
  center: [number, number] | null // [lat, lon]
  radius_km: number | null
  params: Record<string, unknown>
  affected_airports?: string[]
  closes_airports?: boolean
}

export type MissionType = 'medical' | 'cargo' | 'passenger'

export interface Mission {
  id: string
  type: MissionType
  priority: number
  origin_options: string[]
  dest_options: string[]
  release_min: number
  known_min: number
  deadline_min: number | null
  scheduled_arrival_min: number | null
  payload_people: number
  payload_kg: number
  community_id: string | null
  scheduled_aircraft_id: string | null
  scheduled_path: string[] | null
  source: string
  label: string
  origin: string
  dest: string
  is_critical: boolean
}

export interface ScenarioState {
  scenario: Scenario
  disruption_effects: DisruptionEffect[]
  missions: Mission[]
  network_status_t0: { closed_airports: string[]; closed_routes: string[]; failed_aircraft: string[] }
  structurally_disconnected_t0: string[]
  has_do_nothing: boolean
  has_baseline: boolean
  has_northstar: boolean
  policy_id: string
}

export interface Metrics {
  horizon_min: number
  disconnected_communities_end: number
  disconnected_communities_peak: number
  disconnected_community_hours: number
  structural_disconnected_hours: number
  medical_count: number
  medical_unserved: number
  medical_response_avg_min: number | null
  medical_response_max_min: number | null
  medical_within_target_pct: number | null
  critical_missions_total: number
  critical_missions_completed_pct: number | null
  cargo_count: number
  cargo_unserved: number
  cargo_delay_avg_min: number | null
  cargo_completion_rate: number | null
  passenger_count: number
  cancelled_flights: number
  passenger_delay_avg_min: number | null
  passenger_delay_total_min: number
  reroutes: number
  aircraft_utilization_pct: number
  distance_flown_km: number
  operating_cost_index: number
  recovery_time_min: number | null
  recovered: boolean
  missions_total: number
  missions_completed: number
}

export interface MissionOutcome {
  mission_id: string
  type: MissionType
  priority: number
  label: string
  community_id: string | null
  status: string // completed | unserved | pending | assigned | active
  aircraft_id: string | null
  origin: string | null
  dest: string | null
  path: string[] | null
  release_min: number
  deadline_min: number | null
  scheduled_arrival_min: number | null
  scheduled_aircraft_id: string | null
  scheduled_path: string[] | null
  depart_min: number | null
  response_min: number | null
  complete_min: number | null
  assignment_changes: number
  infeasible_reason: string | null
}

export type AircraftStatus = 'ground' | 'flying' | 'failed' | 'stranded'

export interface AircraftSnapshot {
  id: string
  lat: number
  lon: number
  airport_id: string | null
  status: AircraftStatus
  mission_id: string | null
  leg_from: string | null
  leg_to: string | null
  progress: number
}

export interface Snapshot {
  t: number
  aircraft: AircraftSnapshot[]
  closed_airports: string[]
  closed_routes: string[]
  failed_aircraft: string[]
  structural_disconnected: string[]
  service_disconnected: string[]
  disconnected: string[]
  mission_status: Record<string, string>
  critical_pending: number
  route_risk: Record<string, number>
}

export interface Leg {
  aircraft_id: string
  mission_id: string | null
  purpose: 'reposition' | 'mission'
  from_airport: string
  to_airport: string
  depart_min: number
  arrive_min: number
  distance_km: number
}

export interface Trace {
  step_min: number
  horizon_min: number
  snapshots: Snapshot[]
  legs: Leg[]
}

export interface SolverCall {
  status: string
  wall_ms: number
  objective: number | null
  n_missions: number
  n_aircraft: number
  n_pairs: number
  policy: string
  workers?: number
  lookahead_min?: number
}

export interface Replan {
  t: number
  triggers: string[]
  status: string
  assignments: number
  unserved: number
  solver: SolverCall | null
}

export interface SolverSummary {
  calls: number
  total_wall_ms: number
  max_wall_ms: number
  statuses: string[]
  policy: string | null
}

export type RunStatus = 'OK' | 'NO_FEASIBLE_SOLUTION' | 'TIMEOUT' | 'PARTIAL'
export type StrategyName = 'do_nothing' | 'baseline' | 'northstar'

export interface TraceEvent {
  t: number
  type: string
  [key: string]: unknown
}

export interface RunResult {
  strategy: StrategyName
  status: RunStatus
  metrics: Metrics
  assignments: MissionOutcome[]
  /** True when the backend served this result from its content-keyed cache (e.g. the start-up warm-up). */
  cached: boolean
  /** Wall time of the real computation, whenever it happened. */
  compute_ms: number | null
  /** ISO timestamp of the real computation. */
  computed_at: string | null
  trace: Trace
  replans: Replan[]
  solver: SolverSummary | null
  warnings: string[]
  events: TraceEvent[]
  policy: (PolicyWeights & { id: string; name: string; description: string }) | null
  decisions: DecisionRecord[] | null
}

export interface ImpactTimelinePoint {
  t: number
  structural: string[]
  service: string[]
  closed_airports: string[]
  failed_aircraft: string[]
}

export interface ImpactResponse {
  do_nothing: RunResult
  timeline: ImpactTimelinePoint[]
  affected_missions: MissionOutcome[]
  peak_disconnected_t: number
  new_missions: MissionOutcome[]
}

export type MetricDirection = 'lower' | 'higher' | 'info'

export interface MetricInfo {
  label: string
  unit: string
  direction: MetricDirection
}

export interface MetricDelta {
  delta: number
  direction: MetricDirection
  better: boolean | null
}

export interface CompareResponse {
  do_nothing?: Metrics
  baseline?: Metrics
  northstar?: Metrics
  deltas: Record<string, MetricDelta>
  metric_info: Record<string, MetricInfo>
  primary: string[]
  policy_id: string
}

export interface MetricsInfoResponse {
  info: Record<string, MetricInfo>
  primary: string[]
}

export interface DecisionReason {
  code: string
  text: string
  data: Record<string, unknown>
}

export interface DecisionAlternative {
  aircraft_id: string
  verdict: 'rejected' | 'busy' | 'worse'
  reason_code: string | null
  text: string
  reposition_min: number | null
}

export interface DecisionVsBaseline {
  baseline_aircraft_id: string | null
  baseline_status: string | null
  metric: string
  baseline_value: number | null
  northstar_value: number | null
  delta_min: number | null
}

export interface DecisionTradeoff {
  mission_id: string
  text: string
  delta_min: number | null
}

export interface DecisionRecord {
  mission_id: string
  mission_type: MissionType
  priority: number
  label: string
  community_id: string | null
  status: string
  aircraft_id: string | null
  aircraft_type: string | null
  path: string[] | null
  depart_min: number | null
  response_min: number | null
  complete_min: number | null
  decided_at_min: number | null
  reasons: DecisionReason[]
  alternatives: DecisionAlternative[]
  vs_baseline: DecisionVsBaseline | null
  tradeoffs: DecisionTradeoff[]
  summary: string
}

export interface WarmupStatus {
  state: 'pending' | 'running' | 'done' | string
  done: number
  total: number
  presets: string[]
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  datasets_loaded: boolean
  ortools_version: string
  offline: boolean
  dataset_error: string | null
  warmup?: WarmupStatus | null
}

// ---- experiments -----------------------------------------------------------

export interface Stat {
  mean: number | null
  median: number | null
  std: number | null
  n: number
}

export interface MetricComparison {
  label: string
  unit: string
  direction: MetricDirection
  baseline: Stat
  northstar: Stat
  mean_diff: number | null
  improvement_pct: number | null
  wins: number
  losses: number
  ties: number
  p_value: number | null
  significant: boolean
  northstar_better_overall: boolean
}

export interface CensoredCounts {
  medical_unserved_baseline: number
  medical_unserved_northstar: number
  cargo_unserved_baseline: number
  cargo_unserved_northstar: number
  cancelled_flights_baseline: number
  cancelled_flights_northstar: number
  medical_missions_total: number
  cargo_missions_total: number
}

export interface SolverStats {
  calls: number
  optimal_calls: number
  feasible_not_optimal_calls: number
  timeout_calls: number
  max_wall_ms: number
  mean_run_wall_s: number
  runs_not_ok: number
  rejected_assignments: number
}

export type PerScenarioRow = { scenario_id: string; description: string } & Record<string, number | string | null>

export interface ExperimentSummary {
  generated_utc: string
  n_scenarios: number
  seed: number
  policies: string[]
  primary_policy: string
  metric_info: Record<string, MetricInfo>
  primary_metrics: string[]
  git_commit: string | null
  python: string
  ortools_version: string
  platform: string
  horizon_min: number
  policy_weights: Record<string, PolicyWeights>
  comparisons: Record<string, Record<string, MetricComparison>>
  do_nothing: Record<string, Stat>
  censored: Record<string, CensoredCounts>
  solver: Record<string, SolverStats>
  tradeoffs: Record<string, string[]>
  per_scenario: Record<string, PerScenarioRow[]>
}
