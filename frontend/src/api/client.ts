// Thin fetch wrapper over the local FastAPI backend. All URLs are relative
// ("/api/...") so the same build works behind the Vite proxy and when the
// backend serves frontend/dist itself. No other network access exists.
import type { FeatureCollection } from 'geojson'
import type {
  CompareResponse, DecisionRecord, DisruptionInput, ExperimentSummary, HealthResponse, ImpactResponse,
  MetricsInfoResponse, NetworkResponse, Policy, Preset, RunResult, Scenario, ScenarioState,
} from './types'

export class ApiError extends Error {
  status: number
  error: string
  detail: string
  constructor(status: number, error: string, detail: string) {
    super(detail || error)
    this.status = status
    this.error = error
    this.detail = detail
  }
  get unreachable(): boolean { return this.status === 0 }
  get datasetMissing(): boolean { return this.status === 503 }
}

function parseErrorBody(status: number, body: unknown): ApiError {
  // FastAPI HTTPException(detail={error, detail}) -> {detail:{error,detail}}
  // custom handlers                                -> {error, detail}
  // pydantic validation                             -> {detail:[{loc,msg}]}
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const d = b.detail
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const dd = d as Record<string, unknown>
      return new ApiError(status, String(dd.error ?? 'error'), String(dd.detail ?? ''))
    }
    if (Array.isArray(d)) {
      const msg = d.map((x) => {
        const e = x as { loc?: unknown[]; msg?: string }
        return `${(e.loc ?? []).slice(1).join('.')}: ${e.msg ?? ''}`
      }).join('; ')
      return new ApiError(status, 'validation error', msg)
    }
    if (typeof d === 'string') return new ApiError(status, 'error', d)
    if (typeof b.error === 'string') return new ApiError(status, b.error, String(b.detail ?? ''))
  }
  return new ApiError(status, `HTTP ${status}`, typeof body === 'string' ? body : '')
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'backend unreachable', 'The NORTHSTAR backend did not answer.')
  }
  const text = await res.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : null } catch { /* keep text */ }
  if (!res.ok) throw parseErrorBody(res.status, body)
  return body as T
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  network: () => request<NetworkResponse>('/network'),
  presets: () => request<Preset[]>('/presets'),
  /** Full preset definition, disruptions in start order. */
  presetDetail: (preset_id: string) => request<Scenario>(`/presets/${encodeURIComponent(preset_id)}`),
  policies: () => request<Policy[]>('/policies'),
  metricsInfo: () => request<MetricsInfoResponse>('/metrics/info'),
  scenario: () => request<ScenarioState>('/scenario'),
  loadPreset: (preset_id: string) => request<ScenarioState>('/scenario/load', { method: 'POST', body: { preset_id } }),
  /** Replace the session scenario with any Scenario object (the guided demo builds the preset one disruption at a time). */
  loadScenario: (scenario: Scenario) => request<ScenarioState>('/scenario/load', { method: 'POST', body: { scenario } }),
  reset: () => request<ScenarioState>('/scenario/reset', { method: 'POST' }),
  addDisruption: (d: DisruptionInput) => request<ScenarioState>('/scenario/disruptions', { method: 'POST', body: d }),
  removeDisruption: (id: string) => request<ScenarioState>(`/scenario/disruptions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  impact: () => request<ImpactResponse>('/scenario/impact'),
  runBaseline: () => request<RunResult>('/run/baseline', { method: 'POST' }),
  runNorthstar: (policy_id: string) => request<RunResult>('/run/northstar', { method: 'POST', body: { policy_id } }),
  compare: () => request<CompareResponse>('/compare'),
  decisions: () => request<DecisionRecord[]>('/decisions'),
  experimentsLatest: () => request<ExperimentSummary>('/experiments/latest'),
  /** One generated scenario of the committed experiment (experiments/results/scenarios.jsonl), loadable with loadScenario. */
  experimentScenario: (scenario_id: string) => request<Scenario>(`/experiments/scenarios/${encodeURIComponent(scenario_id)}`),
  /** Natural Earth basemap layer as GeoJSON (the map style loads these by URL; the hero loop draws the coastline from the same data). */
  basemap: (layer: 'countries' | 'provinces' | 'lakes') => request<FeatureCollection>(`/basemap/${layer}`),
}

export const EXPERIMENTS_CSV_URL = '/api/experiments/results.csv'
export const basemapUrl = (layer: 'countries' | 'provinces' | 'lakes') => `/api/basemap/${layer}`
