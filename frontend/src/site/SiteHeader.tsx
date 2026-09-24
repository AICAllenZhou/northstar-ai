import { useEffect, useState } from 'react'
import { HREF, type Page } from '../router'

const LINKS: { page: Page; label: string }[] = [
  { page: 'home', label: 'Home' },
  { page: 'simulation', label: 'Simulation' },
  { page: 'research', label: 'Research' },
  { page: 'data', label: 'Data' },
  { page: 'about', label: 'About' },
]

/** Site header: transparent over the hero, translucent once the page has scrolled. */
export function SiteHeader({ page }: { page: Page }) {
  const [scrolled, setScrolled] = useState(false)
  // The menu is "open for" a page, so navigating to another page closes it without an effect.
  const [openFor, setOpenFor] = useState<Page | null>(null)
  const open = openFor === page

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const skip = (e: React.MouseEvent) => {
    e.preventDefault()
    const main = document.getElementById('main')
    main?.focus()
    main?.scrollIntoView()
  }

  return (
    <header className={`site-hdr ${scrolled || open ? 'scrolled' : ''}`}>
      <a className="skip" href="#main" onClick={skip}>Skip to content</a>
      <div className="site-hdr-in">
        <a className="brand" href={HREF.home} aria-label="NORTHSTAR AI home">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">NORTHSTAR AI</span>
        </a>
        <nav className="site-nav" aria-label="Site" id="site-nav" data-open={open}>
          {LINKS.map((l) => (
            <a key={l.page} href={HREF[l.page]} aria-current={page === l.page ? 'page' : undefined} onClick={() => setOpenFor(null)}>{l.label}</a>
          ))}
        </nav>
        <div className="site-hdr-right">
          <a className="btn accent site-cta" href={HREF.simulation}>Launch NORTHSTAR</a>
          <button type="button" className="btn ghost menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpenFor(open ? null : page)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
    </header>
  )
}
