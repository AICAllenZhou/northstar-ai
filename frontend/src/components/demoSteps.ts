// The guided demo: a ten-step narrative built live from one preset, one
// disruption at a time (POST /api/scenario/load with the subset so far).
// Steps carry a `kind` so the stepper can render a card body (damage card,
// RUN button, result card, why card) under the caption.
import type { Disruption, DisruptionType, Scenario } from '../api/types'
import { changedAircraft, statusAt } from '../lib/derive'
import { fmtNumber } from '../lib/format'
import {
  airportName, capitalize, communityName, communityOf, describeDisruption, fmtPop, isNorthHub, listWords,
  nearestMedicalHub, numberWord, pickDecision, plural, shortType, biggestGainSentence,
} from '../lib/humanize'
import { clock } from '../lib/time'
import { useStore, type StoreState } from '../state/store'

export type StepKind = 'plain' | 'damage' | 'run' | 'result' | 'why'

export interface DemoStep {
  id: string
  /** Display headline (rendered uppercase in Plex Condensed). */
  title: string
  kind: StepKind
  /** Performs the API calls / UI changes for the step. Throws on failure. */
  run: () => Promise<void>
  /** What the judge is looking at, computed from the live state (≤ 35 words, one idea). */
  caption: (s: StoreState) => string
}

export interface DemoGroup { ids: string[]; title: string }
export interface DemoPlan { presetId: string; preset: Scenario; groups: DemoGroup[] }

export const PRIMARY_PRESET = 'kivalliq_wildfire'
export const BACKUP_PRESETS = ['baffin_blizzard', 'kitikmeot_medevac_failure', 'cargo_shortage', 'cascading_failure']

/** Fixed narrative order for the primary preset. */
const KIVALLIQ_ORDER: [string, string][] = [['WF-1', 'Wildfire'], ['AF-1', 'Airport closure'], ['ME-1', 'Medical emergency'], ['CG-1', 'Essential cargo']]

const TYPE_TITLE: Record<DisruptionType, string> = {
  wildfire: 'Wildfire', airport_closure: 'Airport closure', severe_weather: 'Severe weather',
  aircraft_failure: 'Aircraft failure', medical_emergency: 'Medical emergency', essential_cargo_request: 'Essential cargo',
}

function groupTitle(ds: Disruption[]): string {
  const types = [...new Set(ds.map((d) => TYPE_TITLE[d.type] ?? d.type))]
  if (types.length === 1) return ds.length > 1 ? `${capitalize(numberWord(ds.length))} ${types[0].toLowerCase()} events` : types[0]
  if (types.length === 2) return `${types[0]} + ${types[1].toLowerCase()}`
  return `${capitalize(numberWord(ds.length))} more events`
}

/** Steps 2–5 for any preset: the primary uses its fixed order; others map disruptions in start order, extras grouped into the last step. */
export function planFor(preset: Scenario): DemoPlan {
  const ds = preset.disruptions
  if (preset.id === PRIMARY_PRESET && KIVALLIQ_ORDER.every(([id]) => ds.some((d) => d.id === id))) {
    const groups = KIVALLIQ_ORDER.map(([id, title]) => ({ ids: [id], title }))
    const extra = ds.filter((d) => !KIVALLIQ_ORDER.some(([id]) => id === d.id)).map((d) => d.id)
    if (extra.length) groups[groups.length - 1].ids.push(...extra)
    return { presetId: preset.id, preset, groups }
  }
  const groups: DemoGroup[] = []
  if (ds.length <= 4) for (const d of ds) groups.push({ ids: [d.id], title: groupTitle([d]) })
  else {
    for (const d of ds.slice(0, 3)) groups.push({ ids: [d.id], title: groupTitle([d]) })
    const rest = ds.slice(3)
    groups.push({ ids: rest.map((d) => d.id), title: groupTitle(rest) })
  }
  return { presetId: preset.id, preset, groups }
}

export async function buildPlan(presetId: string): Promise<DemoPlan> {
  const preset = await useStore.getState().getPresetDetail(presetId)
  return planFor(preset)
}

// ---- captions ----------------------------------------------------------------

const S = () => useStore.getState()
const byId = (plan: DemoPlan) => new Map(plan.preset.disruptions.map((d) => [d.id, d]))

/** Clock used while a step builds the scenario: never runs backwards through the day. */
function focusTime(plan: DemoPlan, upTo: number): number {
  const m = byId(plan)
  let t = 0
  for (const g of plan.groups.slice(0, upTo + 1)) for (const id of g.ids) t = Math.max(t, m.get(id)?.start_min ?? 0)
  return t
}

function closedHubsAt(s: StoreState, t: number): string[] {
  const st = statusAt(s.scenario, null, t, s.network)
  return [...st.closedAirports].filter((id) => { const a = s.network?.airports.find((x) => x.id === id); return a && isNorthHub(a) })
}

function eventCaption(d: Disruption, s: StoreState, t: number): string {
  const n = s.network
  const e = s.scenario?.disruption_effects.find((x) => x.id === d.id)
  switch (d.type) {
    case 'aircraft_failure': {
      const ac = n?.aircraft.find((a) => a.id === d.target_ids[0])
      const hubs = closedHubsAt(s, t)
      const remaining = (n?.aircraft.length ?? 0) - statusAt(s.scenario, null, t, n).failedAircraft.size
      const parts: string[] = []
      if (hubs.length === 1) { const a = n?.airports.find((x) => x.id === hubs[0]); parts.push(`The ${a?.region ?? ''} hub is closed.`) }
      else if (hubs.length > 1) parts.push(`${listWords(hubs.map((h) => airportName(n, h)))} hubs are closed.`)
      if (ac) {
        const atClosedHub = hubs.includes(ac.home_airport_id)
        parts.push(atClosedHub ? `Its ${shortType(ac.type)} is grounded.` : `${airportName(n, ac.home_airport_id)}'s ${ac.type} is grounded.`)
      } else parts.push(`${d.label || 'An aircraft'} is grounded.`)
      parts.push(`${capitalize(numberWord(remaining))} aircraft remain for the whole territory.`)
      return parts.join(' ')
    }
    case 'medical_emergency': {
      const com = communityOf(n, d.target_ids[0])
      const p = Number(d.params.priority ?? 1)
      const hub = com ? nearestMedicalHub(n, com.airport_id) : null
      const closed = hub ? closedHubsAt(s, d.start_min).includes(hub.id) : false
      const hubText = hub ? (closed ? `The nearest hospital hub, ${hub.community_name}, is closed.` : `The nearest hospital hub is ${hub.community_name}.`) : ''
      return `${clock(d.start_min)} — ${com?.name ?? communityName(n, d.target_ids[0])}${com?.population_2021 ? ` (population ${fmtPop(com.population_2021)})` : ''} calls a priority-${p} medical evacuation. ${hubText}`.trim()
    }
    case 'essential_cargo_request': {
      const com = communityOf(n, d.target_ids[0])
      const kg = Number(d.params.payload_kg ?? 0)
      const what = String(d.params.cargo ?? 'essential supplies')
      // The mission created by this request carries the absolute deadline; params.deadline_min counts from the request.
      const mission = (s.scenario?.missions ?? []).find((m) => m.type === 'cargo' && m.release_min === d.start_min && (m.community_id === d.target_ids[0] || m.dest === com?.airport_id))
      const deadline = mission?.deadline_min ?? (d.params.deadline_min !== undefined ? d.start_min + Number(d.params.deadline_min) : null)
      const dl = deadline !== null ? ` by ${clock(deadline)}` : ''
      const urgent = (s.scenario?.missions ?? []).filter((m) => m.type !== 'passenger').length
      const hubs = closedHubsAt(s, t).length
      const failed = statusAt(s.scenario, null, t, n).failedAircraft.size
      const tally = [
        `${capitalize(numberWord(urgent))} urgent ${urgent === 1 ? 'mission' : 'missions'}`,
        hubs ? `${numberWord(hubs)} closed ${hubs === 1 ? 'hub' : 'hubs'}` : null,
        failed ? `${numberWord(failed)} aircraft fewer` : null,
      ].filter(Boolean).join(', ')
      return `${clock(d.start_min)} — ${com?.name ?? communityName(n, d.target_ids[0])}${com?.population_2021 ? ` (population ${fmtPop(com.population_2021)})` : ''} needs ${fmtNumber(kg)} kg of ${what}${dl}. ${tally}.`
    }
    default: {
      const h = describeDisruption(d, e, n, { hubNote: true })
      return `${clock(d.start_min)} — ${h.text} until ${clock(h.end, true)}.`
    }
  }
}

function groupCaption(plan: DemoPlan, gi: number, s: StoreState): string {
  const m = byId(plan)
  const t = focusTime(plan, gi)
  const ds = plan.groups[gi].ids.map((id) => m.get(id)).filter((d): d is Disruption => !!d)
  if (!s.scenario || s.scenario.scenario.id !== plan.presetId) return 'Adding the next event…'
  return ds.map((d) => eventCaption(d, s, t)).join(' ')
}

function solverFacts(s: StoreState): string {
  const n = s.runs.northstar
  if (!n) return ''
  const calls = n.replans.filter((r) => r.solver)
  const counts = new Map<string, number>()
  for (const r of calls) counts.set(r.solver!.status, (counts.get(r.solver!.status) ?? 0) + 1)
  const statusText = [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(', ')
  const ms = n.compute_ms ?? n.solver?.total_wall_ms ?? null
  const where = n.cached
    ? `Result retrieved: computed by the same engine at start-up${ms !== null ? ` in ${fmtNumber(ms)} ms` : ''}.`
    : `Solved${ms !== null ? ` in ${fmtNumber(ms)} ms` : ''}.`
  return `${where} ${plural(calls.length, 'solver call')} (${statusText}); ${n.replans.length} replanning moments across the day.`
}

// ---- steps -----------------------------------------------------------------------

const showScenarioOnly = () => useStore.setState({ displayedRun: null, playing: false, highlightAircraft: [], highlightPath: null, selected: null, expandedDecision: null })

export function buildSteps(plan: DemoPlan): DemoStep[] {
  const allIds = plan.groups.flatMap((g) => g.ids)
  const upTo = (gi: number) => plan.groups.slice(0, gi + 1).flatMap((g) => g.ids)
  const ensureAll = () => S().loadDemoScenario(plan.presetId, allIds)

  const steps: DemoStep[] = [
    {
      id: 'normal', title: 'Normal network', kind: 'plain',
      run: async () => { S().setView('command'); await S().resetScenario(); S().setTime(0) },
      caption: (s) => {
        const n = s.network
        if (!n) return 'A normal day in the network.'
        return `A normal day: ${n.communities.length} fly-in communities, ${n.aircraft.length} aircraft, ${n.schedule.length} scheduled flights. Every community is connected. Real geography from public data; the fleet, schedule and events are synthetic.`
      },
    },
  ]

  plan.groups.forEach((g, gi) => {
    steps.push({
      id: `add-${gi}`, title: g.title, kind: 'plain',
      run: async () => {
        S().setView('command')
        await S().loadDemoScenario(plan.presetId, upTo(gi))
        showScenarioOnly()
        S().setTime(focusTime(plan, gi))
      },
      caption: (s) => groupCaption(plan, gi, s),
    })
  })

  steps.push({
    id: 'damage', title: 'The damage', kind: 'damage',
    run: async () => { S().setView('command'); await ensureAll(); await S().fetchImpact(true) },
    caption: (s) => {
      const imp = s.impact
      if (!imp) return 'Simulating the day with the published schedule only…'
      const m = imp.do_nothing.metrics
      return `If nobody reacts: at ${clock(imp.peak_disconnected_t)}, ${numberWord(m.disconnected_communities_peak)} communities have no air service; ${numberWord(m.disconnected_communities_end)} ${m.disconnected_communities_end === 1 ? 'is' : 'are'} still cut off at the end of the day.`
    },
  })

  steps.push({
    id: 'baseline', title: 'Rule-based baseline', kind: 'plain',
    run: async () => { S().setView('command'); await ensureAll(); await S().runBaseline(); S().setTime(0); S().setSpeed(120); S().play() },
    caption: (s) => {
      const b = s.runs.baseline
      if (!b) return 'Running the rule-based dispatcher…'
      const m = b.metrics
      return `Scheduled flights keep their aircraft; emergencies get the nearest free compatible aircraft, shortest open route, retry when one frees up. Result: ${m.disconnected_communities_end} communities still cut off · ${fmtNumber(m.disconnected_community_hours, 1)} disconnected-community hours · ${plural(m.cancelled_flights, 'flight')} cancelled.`
    },
  })

  steps.push({
    id: 'run', title: 'Run NORTHSTAR AI', kind: 'run',
    run: async () => {
      const s = S()
      s.setView('command')
      await ensureAll()
      s.pause()
      if (!S().runs.baseline) await S().runBaseline()
      S().setDisplayedRun(S().runs.northstar ? 'northstar' : 'baseline')
      S().setTime(0)
    },
    caption: (s) => s.runs.northstar ? solverFacts(s)
      : 'NORTHSTAR re-plans every time something changes: which aircraft flies which mission, in what order, on which open route — under range, runway, capacity and closure constraints.',
  })

  steps.push({
    id: 'result', title: 'Result', kind: 'result',
    run: async () => {
      const s = S()
      s.setView('command')
      await ensureAll()
      if (!S().runs.northstar) throw new Error('Press RUN NORTHSTAR AI first.')
      const st = S()
      st.setDisplayedRun('northstar')
      st.setHighlight(changedAircraft(st.runs.baseline, st.runs.northstar), null)
      st.setTime(0); st.setSpeed(120); st.play()
    },
    caption: (s) => {
      const c = s.compare
      if (!c?.baseline || !c.northstar) return 'Comparing the two responses…'
      // The card itself carries the trade-off line, so the caption states the gain once.
      return biggestGainSentence(c) ?? 'NORTHSTAR did not beat the baseline on any headline metric in this scenario.'
    },
  })

  steps.push({
    id: 'why', title: 'Why, and the evidence', kind: 'why',
    run: async () => {
      const s = S()
      s.setView('command')
      s.pause()
      const d = pickDecision(s.decisions)
      if (!d) throw new Error('NORTHSTAR produced no decision record to explain for this scenario.')
      s.setDisplayedRun('northstar')
      s.highlightDecision(d)
    },
    caption: () => 'Every reason below is a field from the optimizer’s feasibility table and its solution. No language model writes them.',
  })

  return steps
}

/** The step index of the first "add" step (used when the backup preset changes). */
export const FIRST_ADD_STEP = 1
