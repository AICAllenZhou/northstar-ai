import { useState, type ReactNode } from 'react'

export function Expander({ label, children, defaultOpen = false, className = '' }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`expander ${open ? 'open' : ''} ${className}`}>
      <button type="button" className="expander-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="caret" aria-hidden>▸</span>{label}
      </button>
      {open && <div className="expander-body">{children}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <span className="busy"><span className="spinner" />{label && <span>{label}</span>}</span>
}

export function TypeChip({ type }: { type: string }) {
  const cls = type === 'medical' ? 'med' : type === 'cargo' ? 'cargo' : type === 'passenger' ? 'pax' : ''
  const text = type === 'medical' ? 'Medevac' : type === 'cargo' ? 'Cargo' : type === 'passenger' ? 'Pax' : type
  return <span className={`chip ${cls}`}>{text}</span>
}
