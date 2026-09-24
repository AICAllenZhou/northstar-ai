import { aircraftPositionsAt, airportName, communityName, statusAt } from '../lib/derive'
import { clock, duration } from '../lib/time'
import { MISSION_LABEL, ROLE_LABEL, reasonText } from '../lib/format'
import { selectDisplayedRun, useStore } from '../state/store'
import { isHub } from './layers'

export function InfoPanel() {
  const selected = useStore((s) => s.selected)
  const network = useStore((s) => s.network)
  const scenario = useStore((s) => s.scenario)
  const run = useStore(selectDisplayedRun)
  const decisions = useStore((s) => s.decisions)
  const tIdx = useStore((s) => Math.floor(s.t / 30))
  const select = useStore((s) => s.select)
  if (!selected || !network) return null
  const t = tIdx * 30
  const status = statusAt(scenario, run, t, network)
  const close = () => select(null)

  let title = selected.id, kind = selected.kind as string
  let rows: [string, string][] = []
  let flag: { cls: string; text: string } | null = null

  if (selected.kind === 'airport') {
    const a = network.airports.find((x) => x.id === selected.id)
    if (!a) return null
    const c = network.communities.find((x) => x.airport_id === a.id)
    title = a.community_name
    kind = isHub(a) ? 'Hub airport' : 'Community airstrip'
    const closed = status.closedAirports.has(a.id)
    flag = closed ? { cls: 'danger', text: `Closed at ${clock(t)}` } : c && status.structural.has(c.id) ? { cls: 'danger', text: 'Structurally isolated' } : c && status.disconnected.has(c.id) ? { cls: 'warn', text: 'No service today so far' } : { cls: 'good', text: 'Open' }
    rows = [
      ['ICAO / IATA', `${a.id}${a.iata ? ` / ${a.iata}` : ''}`],
      ['Region', a.region],
      ['Runway', `${a.runway_length_m} m ${a.runway_surface}`],
      ['Hub roles', [a.is_medical_hub && 'medical', a.is_cargo_hub && 'cargo', a.is_passenger_hub && 'passenger'].filter(Boolean).join(', ') || 'none'],
      ['Population 2021', c?.population_2021 ? c.population_2021.toLocaleString('en-CA') : '—'],
      ['Data', a.data_flags.length ? a.data_flags.join(', ') : 'OurAirports · StatCan'],
    ]
  } else if (selected.kind === 'aircraft') {
    const ac = network.aircraft.find((x) => x.id === selected.id)
    if (!ac) return null
    title = `${ac.id} · ${ac.type}`
    kind = `${ROLE_LABEL[ac.role] ?? ac.role} aircraft`
    const pos = aircraftPositionsAt(network, run, t, status.failedAircraft).find((p) => p.id === ac.id)
    const where = pos?.status === 'flying' ? `Flying to ${airportName(network, pos.legTo)}${pos.missionId ? ` (${pos.missionId})` : ''}`
      : pos?.status === 'failed' ? 'Unserviceable' : pos?.status === 'stranded' ? `Stranded at ${airportName(network, pos.airportId)} (closed)` : `On ground at ${airportName(network, pos?.airportId ?? ac.home_airport_id)}`
    flag = { cls: pos?.status === 'failed' ? 'danger' : pos?.status === 'stranded' ? 'warn' : pos?.status === 'flying' ? 'ns' : 'base', text: where }
    const served = run?.assignments.filter((o) => o.aircraft_id === ac.id).map((o) => o.mission_id) ?? []
    rows = [
      ['Home base', airportName(network, ac.home_airport_id)],
      ['Range', `${ac.range_km.toLocaleString('en-CA')} km`],
      ['Capacity', `${ac.capacity_people} seats · ${ac.cargo_capacity_kg.toLocaleString('en-CA')} kg`],
      ['Runway need', `≥ ${ac.min_runway_length_m} m${ac.gravel_capable ? ', gravel OK' : ', paved only'}`],
      ['Speed', `${ac.speed_kmh} km/h`],
      ['Missions (shown run)', served.length ? served.join(', ') : '—'],
    ]
  } else if (selected.kind === 'route') {
    const r = network.routes.find((x) => x.id === selected.id)
    if (!r) return null
    title = `${airportName(network, r.origin_airport_id)} — ${airportName(network, r.destination_airport_id)}`
    kind = `Route ${r.id} · ${r.corridor}`
    const closed = status.closedRoutes.has(r.id) || status.closedAirports.has(r.origin_airport_id) || status.closedAirports.has(r.destination_airport_id)
    const risk = status.routeRisk[r.id] ?? r.base_risk
    flag = closed ? { cls: 'danger', text: 'Closed' } : risk > 0.3 ? { cls: 'warn', text: `Elevated risk ${risk.toFixed(2)}` } : { cls: 'good', text: 'Open' }
    rows = [['Distance', `${r.distance_km.toLocaleString('en-CA')} km (great circle)`], ['Base risk', r.base_risk.toFixed(2)], ['Risk now', risk.toFixed(2)]]
  } else if (selected.kind === 'mission' || selected.kind === 'decision') {
    const m = scenario?.missions.find((x) => x.id === selected.id)
    const o = run?.assignments.find((x) => x.mission_id === selected.id)
    const d = decisions.find((x) => x.mission_id === selected.id)
    if (!m) return null
    title = m.label
    kind = `${MISSION_LABEL[m.type]} mission ${m.id} · priority ${m.priority}`
    flag = o?.status === 'unserved' ? { cls: 'danger', text: `Not served: ${reasonText(o.infeasible_reason)}` } : o?.status === 'completed' ? { cls: 'good', text: `Completed ${clock(o.complete_min)} by ${o.aircraft_id}` } : { cls: 'warn', text: run ? 'Pending' : 'No run displayed' }
    rows = [
      ['Community', communityName(network, m.community_id)],
      ['Requested', clock(m.release_min)],
      ['Deadline', m.deadline_min !== null ? clock(m.deadline_min) : '—'],
      ['Payload', m.type === 'cargo' ? `${m.payload_kg} kg` : `${m.payload_people} people`],
      ['Path (shown run)', o?.path ? o.path.map((p) => airportName(network, p)).join(' → ') : `${airportName(network, m.origin)} → ${airportName(network, m.dest)}`],
      ['Response / done', o ? `${duration(o.response_min !== null ? o.response_min - m.release_min : null)} / ${clock(o.complete_min)}` : '—'],
    ]
    if (d && selected.kind === 'decision') rows.push(['NORTHSTAR', d.summary])
  }

  return (
    <aside className="info-panel" aria-live="polite">
      <header>
        <div>
          <div className="eyebrow">{kind}</div>
          <h3>{title}</h3>
        </div>
        <button className="btn small ghost" onClick={close} aria-label="Close">✕</button>
      </header>
      {flag && <div className="info-flag"><span className={`chip ${flag.cls}`}>{flag.text}</span></div>}
      <dl>
        {rows.map(([k, v]) => (<div key={k} className="info-row"><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
    </aside>
  )
}
