import { useState } from 'react'
import type { Mission } from '../api/types'
import { airportName } from '../lib/derive'
import { reasonText } from '../lib/format'
import { clock } from '../lib/time'
import { selectDisplayedRun, useStore } from '../state/store'
import { TypeChip } from './ui'

const ORDER: Record<string, number> = { medical: 0, cargo: 1, passenger: 2 }

export function MissionList() {
  const scenario = useStore((s) => s.scenario)
  const network = useStore((s) => s.network)
  const run = useStore(selectDisplayedRun)
  const tIdx = useStore((s) => Math.floor(s.t / 30))
  const select = useStore((s) => s.select)
  const setHighlight = useStore((s) => s.setHighlight)
  const selected = useStore((s) => s.selected)
  const [showPax, setShowPax] = useState(false)
  const missions = [...(scenario?.missions ?? [])].sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.release_min - b.release_min || a.id.localeCompare(b.id))
  const critical = missions.filter((m) => m.type !== 'passenger')
  const pax = missions.filter((m) => m.type === 'passenger')
  const outcomes = new Map((run?.assignments ?? []).map((o) => [o.mission_id, o]))
  const snap = run ? run.trace.snapshots[Math.min(run.trace.snapshots.length - 1, tIdx)] : null

  const rowFor = (m: Mission) => {
    const o = outcomes.get(m.id)
    const live = snap?.mission_status[m.id]
    let status: { cls: string; text: string } | null = null
    if (run && o) {
      if (o.status === 'unserved') status = { cls: 'danger', text: `unserved · ${reasonText(o.infeasible_reason)}` }
      else if (live === 'completed') status = { cls: 'good', text: `done ${clock(o.complete_min)} · ${o.aircraft_id}` }
      else if (live === 'active') status = { cls: 'ns', text: `en route · ${o.aircraft_id}` }
      else if (live === 'assigned') status = { cls: 'base', text: `assigned ${o.aircraft_id}` }
      else if (tIdx * 30 >= m.release_min) status = { cls: 'warn', text: 'waiting' }
      else status = { cls: 'base', text: `at ${clock(m.release_min)}` }
    }
    const isSel = selected?.id === m.id
    const desc = m.type === 'passenger'
      ? `${airportName(network, m.origin)} → ${airportName(network, m.dest)} · ${m.payload_people} pax`
      : m.label
    return (
      <li key={m.id} className={`strip mission type-${m.type} ${o?.status === 'unserved' ? 'unserved' : ''} ${isSel ? 'selected' : ''}`}
        onClick={() => { select({ kind: 'mission', id: m.id }); setHighlight(o?.aircraft_id ? [o.aircraft_id] : [], o?.path ?? null) }}>
        <div className="strip-main">
          <div className="strip-top"><span className="mono">{m.id}</span><TypeChip type={m.type} />{m.type === 'medical' && <span className="chip med solid-outline">P{m.priority}</span>}<span className="mono time">{clock(m.release_min)}</span></div>
          <div className="strip-label">{desc}</div>
          {status && <div className={`strip-status ${status.cls}`}>{status.text}</div>}
        </div>
      </li>
    )
  }

  return (
    <section className="panel grow">
      <div className="panel-title">
        <span className="eyebrow">Missions <span className="count">{missions.length}</span></span>
        {run && <span className="eyebrow src">{run.strategy === 'do_nothing' ? 'do nothing' : run.strategy}</span>}
      </div>
      {missions.length === 0 && <div className="empty">No missions loaded.</div>}
      <ul className="strip-list">
        {critical.length === 0 && missions.length > 0 && <li className="empty">No medevac or cargo requests. Scheduled flights only.</li>}
        {critical.map(rowFor)}
      </ul>
      {pax.length > 0 && (
        <>
          <button className="pax-toggle" onClick={() => setShowPax((v) => !v)} aria-expanded={showPax}>
            <span className="caret">{showPax ? '▾' : '▸'}</span> {pax.length} scheduled flights
            {run && <span className="muted"> · {pax.filter((m) => outcomes.get(m.id)?.status === 'unserved').length} cancelled</span>}
          </button>
          {showPax && <ul className="strip-list compact">{pax.map(rowFor)}</ul>}
        </>
      )}
    </section>
  )
}
