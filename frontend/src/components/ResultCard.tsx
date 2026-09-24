import { useEffect, useRef } from 'react'
import { bigValue, resultRows, RESULT_LABEL, tradeoffSentence, verdict } from '../lib/humanize'
import { useStore } from '../state/store'

/** Before vs after: at most four rows, Baseline → NORTHSTAR, big numerals, the trade-off never hidden. */
export function ResultCard({ variant = 'panel', onWhy }: { variant?: 'panel' | 'in-demo'; onWhy?: () => void }) {
  const compare = useStore((s) => s.compare)
  const setAdvanced = useStore((s) => s.setAdvanced)
  const focusPanel = useStore((s) => s.focusPanel)
  const setFocusPanel = useStore((s) => s.setFocusPanel)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (variant !== 'panel' || focusPanel !== 'result' || !ref.current) return
    const el = ref.current
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('flash')
    const id = setTimeout(() => { el.classList.remove('flash'); setFocusPanel(null) }, 1800)
    return () => clearTimeout(id)
  }, [focusPanel, setFocusPanel, variant])

  const rows = resultRows(compare)
  if (!compare?.baseline || !compare.northstar || rows.length === 0) return null
  const trade = tradeoffSentence(compare)
  const allTen = () => { setAdvanced(true); setFocusPanel('compare') }
  const why = onWhy ?? (() => setFocusPanel('why'))

  return (
    <section className={`result-card ${variant}`} ref={ref} aria-label="Before vs after">
      <div className="result-head">
        <h3>Before vs after</h3>
        <div className="result-cols" aria-hidden><span className="base">Baseline</span><span className="arrow" /><span className="ns">NORTHSTAR</span></div>
      </div>
      <ul className="result-rows">
        {rows.map((k) => {
          const b = bigValue(k, compare.baseline, compare)
          const n = bigValue(k, compare.northstar, compare)
          const v = verdict(compare, k)
          return (
            <li key={k} className={`result-row ${v}`}>
              <div className="result-label">{RESULT_LABEL[k] ?? compare.metric_info[k]?.label ?? k}</div>
              <div className={`result-v base ${b.censored ? 'censored' : ''}`}><span className="num">{b.text}</span>{b.unit && <span className="unit">{b.unit}</span>}{b.sub && <span className="sub">{b.sub}</span>}</div>
              <div className={`result-arrow ${v}`} aria-hidden>{v === 'better' ? '→' : v === 'worse' ? '→' : '→'}</div>
              <div className={`result-v ns ${v} ${n.censored ? 'censored' : ''}`}><span className="num">{n.text}</span>{n.unit && <span className="unit">{n.unit}</span>}{n.sub && <span className="sub">{n.sub}</span>}</div>
            </li>
          )
        })}
      </ul>
      <p className={`result-trade ${trade ? 'has' : 'none'}`}>{trade ?? 'No metric got worse than under the baseline in this scenario.'}</p>
      <div className="result-foot">
        <button type="button" className="link" onClick={allTen}>All ten metrics</button>
        <button type="button" className="btn small" onClick={why}>Why did NORTHSTAR choose this?</button>
      </div>
    </section>
  )
}
