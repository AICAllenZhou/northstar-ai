import { useEffect, useRef } from 'react'
import { metricCell } from '../lib/format'
import { useStore } from '../state/store'

const HEADLINE = ['medical_response_avg_min', 'disconnected_community_hours', 'cargo_delay_avg_min', 'passenger_delay_avg_min', 'recovery_time_min']

export function ComparePanel() {
  const compare = useStore((s) => s.compare)
  const metricInfo = useStore((s) => s.metricInfo)
  const primary = useStore((s) => s.primaryMetrics)
  const focusPanel = useStore((s) => s.focusPanel)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (focusPanel !== 'compare' || !ref.current) return
    const el = ref.current
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('flash')
    const id = setTimeout(() => { el.classList.remove('flash'); setFocusPanel(null) }, 1800)
    return () => clearTimeout(id)
  }, [focusPanel, setFocusPanel])

  const keys = compare?.primary ?? primary
  const info = compare?.metric_info ?? metricInfo
  const ordered = [...HEADLINE.filter((k) => keys.includes(k)), ...keys.filter((k) => !HEADLINE.includes(k))]
  const any = compare && (compare.do_nothing || compare.baseline || compare.northstar)

  return (
    <section className="panel compare" ref={ref}>
      <div className="panel-title">
        <span className="eyebrow">Before vs After</span>
        {compare?.northstar && <span className="eyebrow src">{compare.policy_id}</span>}
      </div>
      {!any ? (
        <div className="empty">Run the <strong>baseline</strong> and <strong>NORTHSTAR AI</strong> to compare the three responses to this scenario.</div>
      ) : (
        <table className="cmp-table">
          <colgroup><col className="c-label" /><col className="c-val" /><col className="c-val" /><col className="c-val" /></colgroup>
          <thead>
            <tr>
              <th />
              <th className="col-dn">Do nothing</th>
              <th className="col-base">Baseline</th>
              <th className="col-ns">NORTHSTAR</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((k) => {
              const mi = info[k]
              const dn = metricCell(k, compare?.do_nothing, mi)
              const b = metricCell(k, compare?.baseline, mi)
              const n = metricCell(k, compare?.northstar, mi)
              const d = compare?.deltas[k]
              const verdict = !d || !compare?.northstar || !compare?.baseline ? '' : d.delta === 0 || d.better === null ? 'same' : d.better ? 'better' : 'worse'
              return (
                <tr key={k} className={HEADLINE.includes(k) ? 'headline' : ''}>
                  <th scope="row">{mi?.label ?? k}{mi?.direction === 'higher' ? <span className="dir"> ↑ better</span> : mi?.direction === 'lower' ? <span className="dir"> ↓ better</span> : null}</th>
                  <Cell v={dn} />
                  <Cell v={b} />
                  <Cell v={n} cls={verdict} />
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {any && <div className="cmp-note">Unserved missions are counted at the end of the 24 h horizon; such averages are shown as “not served (n)”.</div>}
    </section>
  )
}

function Cell({ v, cls = '' }: { v: { text: string; sub?: string; censored: boolean }; cls?: string }) {
  return (
    <td className={`cmp-cell ${cls} ${v.censored ? 'censored' : ''}`}>
      <div className="cmp-v">{v.text}</div>
      {v.sub && <div className="cmp-sub">{v.sub}</div>}
    </td>
  )
}
