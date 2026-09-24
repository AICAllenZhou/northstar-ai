import { create } from 'zustand'
import { api, ApiError } from '../api/client'
import { loadAdvanced, saveAdvanced } from '../lib/prefs'
import { HREF, navigate } from '../router'
import type {
  CompareResponse, DecisionRecord, DisruptionInput, ExperimentSummary, HealthResponse, ImpactResponse,
  MetricInfo, NetworkResponse, Policy, Preset, RunResult, Scenario, ScenarioState, StrategyName,
} from '../api/types'

/** Legacy view names kept for the demo steps; each maps to a route. */
export type View = 'command' | 'research' | 'responsible' | 'home' | 'data'
export const VIEW_HREF: Record<View, string> = {
  command: HREF.simulation,
  research: HREF.research,
  responsible: `${HREF.about}#responsible-ai`,
  home: HREF.home,
  data: HREF.data,
}
export type Connection = 'unknown' | 'ok' | 'down'
export type SelectedKind = 'airport' | 'aircraft' | 'route' | 'mission' | 'decision'
export interface Selected { kind: SelectedKind; id: string }
export interface UiError { id: number; message: string; retry?: () => void }
export type Busy = 'boot' | 'load' | 'reset' | 'disruption' | 'impact' | 'baseline' | 'northstar' | null
/** Panels that can be scrolled to / opened from elsewhere in the interface. */
export type FocusPanel = 'compare' | 'decisions' | 'disruption-form' | 'result' | 'why' | null

/** The RUN NORTHSTAR moment: an overlay over the map while the request is in flight, then a replay of the real solver log. */
export interface RunMoment {
  seq: number
  startedAt: number
  /** When the HTTP response arrived (performance.now()); null while in flight. */
  respondedAt: number | null
  status: 'pending' | 'done' | 'error'
  result: RunResult | null
  error: string | null
  /** Called when the viewer presses "See the result" (the demo advances; the panel focuses the result card). */
  onDone?: () => void
}

/** A request to (re)start the guided demo, raised from anywhere (header, onboarding, preset cards, resume toast). */
export interface DemoRequest { seq: number; preset?: string; step?: number }

/** Default playback speed: 60 simulated minutes per real second (24 h in 24 s). */
export const SPEEDS = [30, 60, 120, 240]

export interface StoreState {
  view: View
  connection: Connection
  datasetError: string | null
  health: HealthResponse | null
  ready: boolean
  network: NetworkResponse | null
  presets: Preset[]
  presetDetails: Record<string, Scenario>
  policies: Policy[]
  metricInfo: Record<string, MetricInfo>
  primaryMetrics: string[]
  scenario: ScenarioState | null
  impact: ImpactResponse | null
  runs: Partial<Record<StrategyName, RunResult>>
  compare: CompareResponse | null
  decisions: DecisionRecord[]
  experiments: ExperimentSummary | null
  experimentsMissing: boolean
  experimentsError: string | null
  policyId: string
  displayedRun: StrategyName | null
  t: number
  playing: boolean
  speed: number
  selected: Selected | null
  highlightAircraft: string[]
  highlightPath: string[] | null
  expandedDecision: string | null
  focusPanel: FocusPanel
  busy: Busy
  errors: UiError[]
  advanced: boolean
  runMoment: RunMoment | null
  demoRequest: DemoRequest | null
  /** True while the guided demo overlay is open (set by App); simple-mode panels hide their own demo button. */
  demoActive: boolean

  setView: (v: View) => void
  setAdvanced: (v: boolean) => void
  requestDemo: (preset?: string, step?: number) => void
  bootstrap: () => Promise<void>
  pollHealth: () => Promise<void>
  loadPreset: (id: string) => Promise<void>
  getPresetDetail: (id: string) => Promise<Scenario>
  /** Load the preset restricted to the given disruption ids (the guided demo adds one at a time). No-op when already loaded. */
  loadDemoScenario: (presetId: string, ids: string[]) => Promise<void>
  resetScenario: () => Promise<void>
  addDisruption: (d: DisruptionInput) => Promise<void>
  removeDisruption: (id: string) => Promise<void>
  fetchImpact: (display?: boolean) => Promise<ImpactResponse>
  runBaseline: () => Promise<RunResult>
  runNorthstar: (policyId?: string) => Promise<RunResult>
  startNorthstarRun: (policyId?: string, onDone?: () => void) => void
  closeRunMoment: () => void
  refreshCompare: () => Promise<void>
  loadExperiments: () => Promise<void>
  setDisplayedRun: (r: StrategyName | null) => void
  setTime: (t: number) => void
  play: () => void
  pause: () => void
  setSpeed: (s: number) => void
  select: (s: Selected | null) => void
  setHighlight: (aircraft: string[], path: string[] | null) => void
  highlightDecision: (d: DecisionRecord | null) => void
  setExpandedDecision: (id: string | null) => void
  setFocusPanel: (p: FocusPanel) => void
  setPolicyId: (id: string) => void
  pushError: (message: string, retry?: () => void) => void
  dismissError: (id: number) => void
}

let errorSeq = 1
let momentSeq = 0
let demoSeq = 0
/** For fire-and-forget calls: errors are already reported through the store. */
const quiet = (p: Promise<unknown>) => { p.catch(() => undefined) }

export const useStore = create<StoreState>()((set, get) => {
  function handleError(e: unknown, retry?: () => void) {
    if (e instanceof ApiError) {
      if (e.unreachable) { set({ connection: 'down' }); return }
      if (e.datasetMissing) { set({ datasetError: e.detail || e.error }); return }
      get().pushError(`${e.error}: ${e.detail}`.replace(/: $/, ''), retry)
      return
    }
    get().pushError(e instanceof Error ? e.message : String(e), retry)
  }

  async function guarded<T>(label: Busy, fn: () => Promise<T>, retry?: () => void): Promise<T> {
    set({ busy: label })
    try {
      const r = await fn()
      set({ busy: null, connection: 'ok' })
      return r
    } catch (e) {
      set({ busy: null })
      handleError(e, retry)
      throw e
    }
  }

  function applyScenario(scenario: ScenarioState) {
    set({
      scenario, impact: null, runs: {}, compare: null, decisions: [], displayedRun: null, t: 0, playing: false,
      selected: null, highlightAircraft: [], highlightPath: null, expandedDecision: null, focusPanel: null,
      policyId: scenario.policy_id || get().policyId,
    })
  }

  return {
    view: 'command',
    connection: 'unknown',
    datasetError: null,
    health: null,
    ready: false,
    network: null,
    presets: [],
    presetDetails: {},
    policies: [],
    metricInfo: {},
    primaryMetrics: [],
    scenario: null,
    impact: null,
    runs: {},
    compare: null,
    decisions: [],
    experiments: null,
    experimentsMissing: false,
    experimentsError: null,
    policyId: 'balanced',
    displayedRun: null,
    t: 0,
    playing: false,
    speed: 60,
    selected: null,
    highlightAircraft: [],
    highlightPath: null,
    expandedDecision: null,
    focusPanel: null,
    busy: null,
    errors: [],
    advanced: loadAdvanced(),
    runMoment: null,
    demoRequest: null,
    demoActive: false,

    setView: (view) => { set({ view }); navigate(VIEW_HREF[view]) },
    setAdvanced: (advanced) => { saveAdvanced(advanced); set({ advanced }) },
    requestDemo: (preset, step) => set({ demoRequest: { seq: ++demoSeq, preset, step } }),

    bootstrap: async () => {
      await guarded('boot', async () => {
        const health = await api.health()
        set({ health })
        if (!health.datasets_loaded) { set({ datasetError: health.dataset_error ?? 'datasets not loaded' }); return }
        const [network, presets, policies, mi, scenario] = await Promise.all([
          api.network(), api.presets(), api.policies(), api.metricsInfo(), api.scenario(),
        ])
        set({ network, presets, policies, metricInfo: mi.info, primaryMetrics: mi.primary, datasetError: null })
        applyScenario(scenario)
        set({ ready: true })
        // Restore runs that the backend session already holds (e.g. after a browser reload).
        // Each step is skipped if the user has already moved to another scenario.
        try {
          if (scenario.has_do_nothing && get().scenario === scenario) await get().fetchImpact(false)
          if (scenario.has_baseline && get().scenario === scenario) await get().runBaseline()
          if (scenario.has_northstar && get().scenario === scenario) await get().runNorthstar(scenario.policy_id)
        } catch { /* reported by guarded(); the healthy part of the state is kept */ }
      }, () => quiet(get().bootstrap()))
    },

    pollHealth: async () => {
      try {
        const health = await api.health()
        const wasDown = get().connection !== 'ok'
        set({ health, connection: 'ok', datasetError: health.datasets_loaded ? null : (health.dataset_error ?? 'datasets not loaded') })
        if (wasDown && !get().ready && health.datasets_loaded) quiet(get().bootstrap())
      } catch (e) {
        if (e instanceof ApiError && e.unreachable) set({ connection: 'down' })
      }
    },

    loadPreset: async (id) => {
      const st = await guarded('load', () => api.loadPreset(id), () => quiet(get().loadPreset(id)))
      applyScenario(st)
    },

    getPresetDetail: async (id) => {
      const cached = get().presetDetails[id]
      if (cached) return cached
      const detail = await api.presetDetail(id)
      set((s) => ({ presetDetails: { ...s.presetDetails, [id]: detail } }))
      return detail
    },

    loadDemoScenario: async (presetId, ids) => {
      const detail = await get().getPresetDetail(presetId)
      const wanted = new Set(ids)
      const cur = get().scenario?.scenario
      if (cur && cur.id === detail.id && cur.disruptions.length === wanted.size && cur.disruptions.every((d) => wanted.has(d.id))) return
      // Keep the preset's own order so the fully built scenario is byte-identical to the preset (cache hits).
      const scenario: Scenario = { ...detail, disruptions: detail.disruptions.filter((d) => wanted.has(d.id)) }
      const st = await guarded('load', () => api.loadScenario(scenario), () => quiet(get().loadDemoScenario(presetId, ids)))
      applyScenario(st)
    },

    resetScenario: async () => {
      const st = await guarded('reset', () => api.reset(), () => quiet(get().resetScenario()))
      applyScenario(st)
    },

    addDisruption: async (d) => {
      const st = await guarded('disruption', () => api.addDisruption(d))
      applyScenario(st)
    },

    removeDisruption: async (id) => {
      const st = await guarded('disruption', () => api.removeDisruption(id))
      applyScenario(st)
    },

    fetchImpact: async (display = true) => {
      const existing = get().impact
      const sc = get().scenario
      const impact = existing ?? await guarded('impact', () => api.impact(), () => quiet(get().fetchImpact(display)))
      if (get().scenario !== sc) return impact // scenario changed meanwhile: discard
      set((s) => ({ impact, runs: { ...s.runs, do_nothing: impact.do_nothing } }))
      if (display) set({ displayedRun: 'do_nothing', t: impact.peak_disconnected_t, playing: false })
      await get().refreshCompare()
      return impact
    },

    runBaseline: async () => {
      const sc = get().scenario
      if (!get().impact) await get().fetchImpact(false)
      const run = await guarded('baseline', () => api.runBaseline(), () => quiet(get().runBaseline()))
      if (get().scenario !== sc) return run
      set((s) => ({ runs: { ...s.runs, baseline: run }, displayedRun: 'baseline', t: 0, playing: false }))
      await get().refreshCompare()
      return run
    },

    runNorthstar: async (policyId) => {
      const pid = policyId ?? get().policyId
      const sc = get().scenario
      if (!get().impact) await get().fetchImpact(false)
      if (!get().runs.baseline) await get().runBaseline()
      const run = await guarded('northstar', () => api.runNorthstar(pid), () => quiet(get().runNorthstar(pid)))
      if (get().scenario !== sc) return run
      let decisions = run.decisions ?? []
      if (!run.decisions) {
        try { decisions = await api.decisions() } catch { decisions = [] }
      }
      set((s) => ({ runs: { ...s.runs, northstar: run }, decisions, policyId: pid, displayedRun: 'northstar', t: 0, playing: false }))
      await get().refreshCompare()
      return run
    },

    startNorthstarRun: (policyId, onDone) => {
      const seq = ++momentSeq
      get().pause()
      set({ runMoment: { seq, startedAt: performance.now(), respondedAt: null, status: 'pending', result: null, error: null, onDone } })
      const patch = (p: Partial<RunMoment>) => {
        const m = get().runMoment
        if (m && m.seq === seq) set({ runMoment: { ...m, ...p } })
      }
      get().runNorthstar(policyId)
        .then((result) => patch({ status: 'done', result, respondedAt: performance.now() }))
        .catch((e) => patch({ status: 'error', error: e instanceof Error ? e.message : String(e), respondedAt: performance.now() }))
    },
    closeRunMoment: () => set({ runMoment: null }),

    refreshCompare: async () => {
      const sc = get().scenario
      try {
        const compare = await api.compare()
        if (get().scenario === sc) set({ compare })
      } catch (e) {
        handleError(e)
      }
    },

    loadExperiments: async () => {
      try {
        const experiments = await api.experimentsLatest()
        set({ experiments, experimentsMissing: false, experimentsError: null })
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) set({ experiments: null, experimentsMissing: true, experimentsError: null })
        else if (e instanceof ApiError && e.unreachable) set({ connection: 'down', experimentsError: 'Backend unreachable.' })
        else set({ experimentsError: e instanceof Error ? e.message : String(e) })
      }
    },

    setDisplayedRun: (r) => {
      if (r === 'do_nothing' && !get().impact) { quiet(get().fetchImpact(true)); return }
      set({ displayedRun: r, playing: false })
    },
    setTime: (t) => set({ t: Math.max(0, Math.min(1440, t)) }),
    play: () => set((s) => ({ playing: true, t: s.t >= 1440 ? 0 : s.t })),
    pause: () => set({ playing: false }),
    setSpeed: (speed) => set({ speed }),
    select: (selected) => set({ selected }),
    setHighlight: (highlightAircraft, highlightPath) => set({ highlightAircraft, highlightPath }),
    highlightDecision: (d) => {
      if (!d) { set({ highlightAircraft: [], highlightPath: null, selected: null }); return }
      set({
        highlightAircraft: d.aircraft_id ? [d.aircraft_id] : [], highlightPath: d.path,
        selected: { kind: 'decision', id: d.mission_id }, expandedDecision: d.mission_id,
      })
      if (d.depart_min !== null) set({ t: d.depart_min, playing: false })
    },
    setExpandedDecision: (expandedDecision) => set({ expandedDecision }),
    setFocusPanel: (focusPanel) => set({ focusPanel }),
    setPolicyId: (policyId) => set({ policyId }),
    pushError: (message, retry) => set((s) => ({ errors: [...s.errors.slice(-3), { id: errorSeq++, message, retry }] })),
    dismissError: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),
  }
})

export const selectDisplayedRun = (s: StoreState): RunResult | null => (s.displayedRun ? s.runs[s.displayedRun] ?? null : null)
export const selectControlsDisabled = (s: StoreState): boolean => s.connection === 'down' || !s.ready || s.busy !== null
export const selectHasDisruptions = (s: StoreState): boolean => (s.scenario?.scenario.disruptions.length ?? 0) > 0
export const selectWarm = (s: StoreState): boolean => s.health?.warmup?.state === 'done'
