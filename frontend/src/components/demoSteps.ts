import { changedAircraft } from '../lib/derive'
import { fmtMetric, metricCell } from '../lib/format'
import { clock, duration, signedDuration } from '../lib/time'
import { useStore, type StoreState } from '../state/store'

export interface DemoStep {
  title: string
  /** Performs the API calls / UI changes for the step. Throws on failure. */
  run: (presetId: string) => Promise<void>
  /** What the judge is looking at, computed from the live state. */
  caption: (s: StoreState) => string
}

export const BACKUP_PRESETS = ['baffin_blizzard', 'kitikmeot_medevac_failure', 'cargo_shortage', 'cascading_failure']
export const PRIMARY_PRESET = 'kivalliq_wildfire'

const S = () => useStore.getState()
const name = (s: StoreState, id: string | null | undefined) => s.network?.airports.find((a) => a.id === id)?.community_name ?? id ?? '—'
const cname = (s: StoreState, id: string | null | undefined) => s.network?.communities.find((c) => c.id === id)?.name ?? id ?? '—'

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Healthy network',
    run: async () => { S().setView('command'); await S().resetScenario() },
    caption: (s) => {
      const n = s.network
      if (!n) return 'A normal day in the network.'
      return `A normal day. ${n.airports.length} airports (${n.hubs.medical.length} hubs, 3 southern gateways off-screen), ${n.communities.length} fly-in communities, ${n.aircraft.length} aircraft and ${n.schedule.length} scheduled flights. Every community is connected. Real geography from OurAirports, Statistics Canada and Natural Earth; the fleet and schedule are synthetic.`
    },
  },
  {
    title: 'Trigger the disruption',
    run: async (preset) => { S().setView('command'); await S().loadPreset(preset); S().setTime(0) },
    caption: (s) => {
      const sc = s.scenario?.scenario
      if (!sc) return 'Loading the scenario…'
      const list = sc.disruptions.map((d) => `${d.label || d.type} (${clock(d.start_min)})`).join('; ')
      return `${sc.name}. ${sc.description} Disruptions: ${list}. Nothing has been analysed yet: the badge says WARNING.`
    },
  },
  {
    title: 'Impact before any intervention',
    run: async () => { S().setView('command'); await S().fetchImpact(true) },
    caption: (s) => {
      const imp = s.impact
      if (!imp) return 'Simulating the day with the published schedule only…'
      const m = imp.do_nothing.metrics
      const news = imp.new_missions.map((x) => `${x.type === 'medical' ? 'medevac from' : 'cargo to'} ${cname(s, x.community_id)} (${x.status})`).join(', ')
      return `If nobody reacts: a peak of ${m.disconnected_communities_peak} disconnected communities at ${clock(imp.peak_disconnected_t)} (shown on the map), ${fmtMetric('h', m.disconnected_community_hours, { label: '', unit: 'h', direction: 'lower' })} of disconnected-community time, ${m.cancelled_flights} cancelled flights. New missions: ${news || 'none'}.`
    },
  },
  {
    title: 'Baseline response',
    run: async () => { S().setView('command'); await S().runBaseline(); S().setTime(0); S().setSpeed(120); S().play() },
    caption: (s) => {
      const b = s.runs.baseline
      if (!b) return 'Running the rule-based dispatcher…'
      const m = b.metrics
      const med = metricCell('medical_response_avg_min', m).text
      return `Rule-based dispatcher (the non-AI control): nearest free compatible aircraft, shortest open route, retry when an aircraft frees up. Result: medical response ${med}, ${m.disconnected_community_hours} disconnected-community hours, ${m.cancelled_flights} cancelled flights, ${duration(m.passenger_delay_avg_min)} mean passenger delay. Grey routes are the ones it flew.`
    },
  },
  {
    title: 'RUN NORTHSTAR AI',
    run: async () => { S().setView('command'); S().pause(); await S().runNorthstar(); S().setTime(0) },
    caption: (s) => {
      const n = s.runs.northstar
      if (!n) return 'NORTHSTAR is solving…'
      const sol = n.solver
      const pol = n.policy?.name ?? s.policyId
      return `NORTHSTAR formulates each replanning moment as a constraint-optimization model (OR-Tools CP-SAT): which aircraft serves which mission, in what order, on which open route, minimising weighted medical response, disconnected-community time, cargo and passenger delay, distance and reroutes (“${pol}” weights). ${sol ? `${sol.calls} solver calls, ${(sol.total_wall_ms / 1000).toFixed(1)} s in total` : ''}. Status: ${n.status}.`
    },
  },
  {
    title: 'What changed',
    run: async () => {
      const s = S()
      s.setView('command')
      s.setDisplayedRun('northstar')
      s.setHighlight(changedAircraft(s.runs.baseline, s.runs.northstar), null)
      s.setTime(0); s.setSpeed(120); s.play()
    },
    caption: (s) => {
      const ch = changedAircraft(s.runs.baseline, s.runs.northstar)
      const types = ch.map((id) => `${id} (${s.network?.aircraft.find((a) => a.id === id)?.type ?? ''})`).join(', ')
      return `Playing the NORTHSTAR plan. Pulsing aircraft carry different work than in the baseline: ${types || 'no reassignment needed'}. Teal routes are the ones NORTHSTAR used; dashed red routes are closed; amber rings mark communities without service at that moment.`
    },
  },
  {
    title: 'Before vs after',
    run: async () => { const s = S(); s.setView('command'); s.pause(); s.setTime(1440); s.setFocusPanel('compare') },
    caption: (s) => {
      const c = s.compare
      if (!c?.baseline || !c.northstar) return 'Comparing the three responses…'
      const info = c.metric_info
      const better: string[] = [], worse: string[] = []
      for (const k of ['disconnected_community_hours', 'medical_response_avg_min', 'cargo_delay_avg_min', 'passenger_delay_avg_min', 'cancelled_flights', 'recovery_time_min']) {
        const d = c.deltas[k]
        if (!d || d.delta === 0) continue
        const txt = `${info[k]?.label.toLowerCase() ?? k} ${info[k]?.unit === 'min' ? signedDuration(d.delta) : (d.delta > 0 ? '+' : '') + d.delta}${info[k]?.unit && info[k].unit !== 'min' ? ' ' + info[k].unit : ''}`
        ;(d.better ? better : worse).push(txt)
      }
      return `Do nothing | Baseline | NORTHSTAR, same simulator, same metric function. Versus the baseline NORTHSTAR improved: ${better.join('; ') || 'nothing'}. ${worse.length ? `It did worse on: ${worse.join('; ')} — a real trade-off, shown in red, not hidden.` : 'No metric got worse in this scenario.'}`
    },
  },
  {
    title: 'Explain one decision',
    run: async () => {
      const s = S()
      s.setView('command')
      const d = s.decisions.find((x) => x.mission_type === 'medical') ?? s.decisions[0]
      if (!d) throw new Error('NORTHSTAR produced no decision record to explain for this scenario.')
      s.highlightDecision(d)
      s.setFocusPanel('decisions')
    },
    caption: (s) => {
      const d = s.decisions.find((x) => x.mission_id === s.expandedDecision) ?? s.decisions.find((x) => x.mission_type === 'medical') ?? s.decisions[0]
      if (!d) return 'No decision to explain.'
      const rej = d.alternatives.filter((a) => a.verdict === 'rejected').length
      const busy = d.alternatives.filter((a) => a.verdict === 'busy').length
      const worse = d.alternatives.filter((a) => a.verdict === 'worse').length
      return `${d.summary} Every reason is a structured field computed from the feasibility table and the solver's choice; no language model writes them. ${d.alternatives.length} alternatives were considered: ${rej} infeasible, ${busy} busy with other work, ${worse} feasible but slower. The chosen path is highlighted on the map (${(d.path ?? []).map((p) => name(s, p)).join(' → ')}).`
    },
  },
  {
    title: 'Aggregate experiment',
    run: async () => { S().setView('research'); await S().loadExperiments() },
    caption: (s) => {
      const e = s.experiments
      if (s.experimentsMissing) return 'The 100-scenario experiment has not been run on this machine yet. The Research view shows the exact command to generate it.'
      if (!e) return 'Loading the experiment summary…'
      const c = e.comparisons[e.primary_policy]
      const dc = c.disconnected_community_hours, md = c.medical_response_avg_min, pd = c.passenger_delay_avg_min
      const tr = e.tradeoffs[e.primary_policy]
      return `${e.n_scenarios} generated disruption scenarios (seed ${e.seed}), each run once with the baseline and once with NORTHSTAR from an identical start. NORTHSTAR won ${dc.wins}/${e.n_scenarios} on disconnected-community hours (${dc.improvement_pct}% lower mean), ${md.wins} on medical response (${md.losses} losses, ${md.ties} ties), ${pd.wins} on passenger delay. Metrics where the baseline won more often: ${tr.length ? tr.map((k) => c[k].label).join(', ') : 'none'}. Sign-test p-values are shown per metric.`
    },
  },
  {
    title: 'Responsible AI',
    run: async () => { S().setView('responsible') },
    caption: (s) => `${s.network?.disclaimer ?? 'NORTHSTAR AI is a research simulation and decision-support prototype.'} Humans stay in the loop: NORTHSTAR recommends, nothing is applied automatically; every weight is visible; real and synthetic data are labelled; failure states are explicit; results are not claimed to generalise beyond this simulation.`,
  },
]
