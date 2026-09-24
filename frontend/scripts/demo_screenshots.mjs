// Drives the landing site and the ten-step guided demo in headless Chromium and
// saves PNGs: the landing sections (desktop + 390px mobile), Data, About, the
// first-entry onboarding dialog, the app header, one PNG per demo step (step 8
// twice: before pressing RUN and during the solver-log replay), the simple and
// Advanced command centre, the preset cards, the result and why cards, the run
// moment, Research, Responsible AI, three failure states, plus (V3) the hero with
// the coastline at 1440 (hero-coast), the landing scrolled under the glass header
// (site-scrolled) and a zoomed Kivalliq map detail at demo step 9 (map-detail), plus (V4)
// the Research story in sections (research-story, research-strips, research-losses,
// research-solver, research-explorer), the Data provenance table (data-page), the About
// limitations (about-page), the why card with every candidate aircraft (why-alternatives)
// and a round trip through "Open in simulator" (research-open-sim) that asserts the
// generated scenario really loaded and then resets the session, plus (V5) the command centre
// at 1280 x 900 in the guided demo (narrow-1280 at step 9, narrow-1280-why at step 10, with the
// overflow check), the same step 9 under prefers-reduced-motion (reduced-motion, asserting that the
// flow loop never ran and no CSS animation is running), an accessibility floor on every page
// (accessible names, labelled controls, one h1, no heading skips, labelled images and dialogs), a
// keyboard tab walk of the command centre with focus-ring checks, and a WCAG contrast sample of
// every small text on the audited pages (plus the --ink-3 token against its grounds).
//
//   node scripts/demo_screenshots.mjs            (dev server on :5173, backend on :8000)
//   BASE_URL=http://localhost:8000 node scripts/demo_screenshots.mjs   (production build served by the backend)
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.OUT_DIR ?? path.resolve(HERE, '../../docs/screenshots')
mkdirSync(OUT, { recursive: true })

// Headless Chromium renders WebGL in software (SwiftShader) and, on tall viewports, its captures can
// leave a band of the map canvas unpainted (a compositing artifact of the software path, not app state:
// the same page captured with the GPU is complete). On macOS the real GPU is always available, so ask for it.
const GPU_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--use-gl=angle', '--ignore-gpu-blocklist'] : []
const browser = await chromium.launch({ args: GPU_ARGS })
const problems = []
const expected = []
const external = new Set()

// `expectFailures` marks the deliberate failure-state pages (forced 404, aborted API):
// their failed requests are the point of the test, so they are reported but not counted.
// `advanced` presets the persisted Advanced-mode switch (localStorage northstar.advanced).
async function newPage(viewport = { width: 1600, height: 1000 }, { onboarded = true, label = 'page', expectFailures = false, advanced = false } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  // The first-entry welcome dialog is session-scoped; every page except the dedicated
  // onboarding shot starts with the flag set so the dialog does not cover the pictures.
  await page.addInitScript(({ onboarded, advanced }) => {
    try {
      if (onboarded) sessionStorage.setItem('northstar.onboarded', '1')
      localStorage.setItem('northstar.advanced', advanced ? '1' : '0')
    } catch { /* ignore */ }
  }, { onboarded, advanced })
  const report = (msg, network) => (expectFailures && network ? expected : problems).push(`[${label}] ${msg}`)
  page.on('pageerror', (e) => report(`pageerror: ${e.message}`, false))
  page.on('console', (m) => { if (m.type() === 'error') report(`console.error: ${m.text().slice(0, 200)}`, /Failed to load resource/.test(m.text())) })
  page.on('requestfailed', (r) => report(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`, true))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') external.add(r.url())
  })
  return page
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts })
const url = (hash) => `${BASE}/${hash}`
const waitMarkers = (page) => page.waitForFunction(() => document.querySelectorAll('.ac-marker').length >= 10, null, { timeout: 60000 })
const waitIdle = (page) => page.waitForFunction(() => !document.querySelector('.cc .spinner'), null, { timeout: 120000 })
// The map exposes itself as window.__northstarMap; wait for MapLibre's next `idle` event (tiles loaded,
// nothing pending). Best effort with a timeout: headless software WebGL is slow, and during playback the
// trails source is rewritten every frame.
const waitMapIdle = (page, ms = 15000) => page.evaluate((ms) => new Promise((res) => {
  const m = window.__northstarMap
  if (!m) return res(false)
  const t = setTimeout(() => res(false), ms)
  m.once('idle', () => { clearTimeout(t); res(true) })
  m.triggerRepaint()
}), ms).catch(() => false)
// Landing sections reveal once they enter the viewport; a full-page capture never scrolls, so walk the
// page first (and back to the top) before shooting it whole.
async function revealAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) }
    window.scrollTo(0, 0)
  })
  await page.waitForFunction(() => document.querySelectorAll('.reveal:not(.in)').length === 0, null, { timeout: 5000 }).catch(() => problems.push('landing: some sections did not reveal after scrolling through the page'))
  await page.waitForTimeout(700)
}
// Demo step 9: one zoom level in on the Kivalliq region (flow, trails, disruption boundary, hub halos),
// placed below the demo card, while playback continues; the view is restored afterwards.
async function mapDetail(page) {
  const prev = await page.evaluate(() => {
    const m = window.__northstarMap
    if (!m) return null
    const before = { center: m.getCenter().toArray(), zoom: m.getZoom() }
    m.easeTo({ center: [-93.4, 62.9], zoom: m.getZoom() + 1, duration: 0 })
    return before
  })
  if (!prev) problems.push('map-detail: window.__northstarMap not available')
  await page.waitForTimeout(1500)
  await shot(page, 'map-detail')
  if (prev) await page.evaluate((p) => window.__northstarMap?.easeTo({ center: p.center, zoom: p.zoom, duration: 0 }), prev)
}
const clipTo = async (page, selector, pad = 8) => {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) return undefined
  return { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 }
}

// ---- V5 checks --------------------------------------------------------------
// Accessibility floor, evaluated in the page: only rendered elements count (nothing inside [hidden] or aria-hidden,
// nothing without a box), so the kept-mounted command centre does not leak into the site pages.
async function a11yAudit(page, label) {
  const r = await page.evaluate(() => {
    const visible = (el) => {
      if (el.closest('[hidden],[aria-hidden="true"]')) return false
      if (!el.getClientRects().length) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
    const byIds = (ids) => (ids ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
    const nameOf = (el) => {
      const al = el.getAttribute('aria-label')
      if (al && al.trim()) return al.trim()
      const lb = byIds(el.getAttribute('aria-labelledby'))
      if (lb) return lb
      const t = el.textContent.replace(/\s+/g, ' ').trim()
      if (t) return t
      const inner = el.querySelector('img[alt], [aria-label]')
      return inner ? (inner.getAttribute('alt') || inner.getAttribute('aria-label') || '').trim() : ''
    }
    const issues = []
    const counts = { controls: 0, fields: 0, headings: 0, images: 0, dialogs: 0 }
    for (const el of document.querySelectorAll('button, a')) {
      if (!visible(el)) continue
      counts.controls++
      if (!nameOf(el)) issues.push(`no accessible name: ${desc(el)}`)
    }
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.type === 'hidden' || (!visible(el) && !el.closest('label'))) continue
      counts.fields++
      const ok = el.getAttribute('aria-label') || byIds(el.getAttribute('aria-labelledby')) || el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
      if (!ok) issues.push(`unlabelled control: ${desc(el)}`)
    }
    const h1s = [...document.querySelectorAll('h1')].filter(visible)
    if (h1s.length !== 1) issues.push(`${h1s.length} h1 elements: ${h1s.map((h) => JSON.stringify(h.textContent.trim().slice(0, 30))).join(', ') || 'none'}`)
    let prev = 0
    for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      if (!visible(h)) continue
      counts.headings++
      const lv = Number(h.tagName[1])
      if (prev && lv > prev + 1) issues.push(`heading skips h${prev} → h${lv}: "${h.textContent.trim().slice(0, 40)}"`)
      prev = lv
    }
    for (const img of document.querySelectorAll('img')) { if (!visible(img)) continue; counts.images++; if (!img.hasAttribute('alt')) issues.push(`img without alt: ${img.getAttribute('src')}`) }
    for (const sv of document.querySelectorAll('svg[role="img"]')) { if (!visible(sv)) continue; counts.images++; if (!sv.getAttribute('aria-label') && !byIds(sv.getAttribute('aria-labelledby'))) issues.push(`svg[role=img] without label: ${desc(sv)}`) }
    for (const d of document.querySelectorAll('[role="dialog"]')) { if (!visible(d)) continue; counts.dialogs++; if (!d.getAttribute('aria-label') && !byIds(d.getAttribute('aria-labelledby'))) issues.push(`dialog without label: ${desc(d)}`) }
    return { issues, counts }
  })
  console.log(`a11y ${label}: ${r.counts.controls} buttons/links, ${r.counts.fields} fields, ${r.counts.headings} headings, ${r.counts.images} images, ${r.counts.dialogs} dialogs · ${r.issues.length ? r.issues.length + ' issue(s)' : 'clean'}`)
  for (const i of r.issues) problems.push(`a11y ${label}: ${i}`)
  return r
}

// WCAG 2.x contrast of every rendered text smaller than 14 px against its composited CSS background (ancestors'
// background-colors blended bottom-up; elements over gradients or the map canvas are skipped as unknown).
// Fails on anything under 4.5:1 and reports the worst few, plus the --ink-3 token against bg-0 / bg-1 / bg-2.
async function contrastAudit(page, label) {
  const r = await page.evaluate(() => {
    const parse = (str) => { const m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a] = m[1].split(/[\s,/]+/).map(Number); return { r, g, b, a: Number.isFinite(a) ? a : 1 } }
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }
    const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
    const root = getComputedStyle(document.documentElement)
    const token = (n) => { const v = root.getPropertyValue(n).trim(); const m = v.match(/^#([0-9a-f]{6})$/i); return m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 } : null }
    const ink3 = token('--ink-3')
    const tokens = ink3 ? Object.fromEntries(['--bg-0', '--bg-1', '--bg-2'].map((g) => [g, +ratio(ink3, token(g)).toFixed(2)])) : null
    // Effective background: walk up compositing translucent background-colors; a gradient means "unknown".
    const bgOf = (el) => {
      const layers = []
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.backgroundImage !== 'none') return null
        const c = parse(cs.backgroundColor)
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
      }
      if (!layers.length || layers[layers.length - 1].a < 1) layers.push(parse(getComputedStyle(document.body).backgroundColor) ?? { r: 7, g: 12, b: 20, a: 1 })
      let bg = layers.pop()
      while (layers.length) bg = over(layers.pop(), bg)
      return bg
    }
    const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
    const out = []
    let sampled = 0, skipped = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    for (let el = walker.nextNode(); el; el = walker.nextNode()) {
      if (el.closest('script, style, svg, .maplibregl-map, [hidden], [aria-hidden="true"]')) continue
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()
      if (!text || !el.getClientRects().length) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      const fs = parseFloat(cs.fontSize)
      if (fs >= 14) continue
      const op = opacityOf(el)
      if (op < 0.1) continue
      const bg = bgOf(el)
      const color = parse(cs.color)
      if (!bg || !color) { skipped++; continue }
      sampled++
      const fg = over({ ...color, a: color.a * op }, bg)
      const rt = ratio(fg, bg)
      if (rt < 4.5) out.push({ ratio: +rt.toFixed(2), fs, fg: hex(fg), bg: hex(bg), text: text.slice(0, 36), el: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}` })
    }
    out.sort((a, b) => a.ratio - b.ratio)
    return { tokens, ink3: ink3 ? hex(ink3) : null, sampled, skipped, low: out }
  })
  console.log(`contrast ${label}: ${r.sampled} small texts sampled (${r.skipped} over gradients skipped) · ${r.low.length} under 4.5:1 · --ink-3 ${r.ink3} → ${r.tokens ? Object.entries(r.tokens).map(([k, v]) => `${k} ${v}`).join(', ') : 'n/a'}`)
  if (r.tokens) for (const [g, v] of Object.entries(r.tokens)) if (v < 4.5) problems.push(`contrast ${label}: --ink-3 on ${g} is ${v}:1`)
  for (const l of r.low.slice(0, 8)) problems.push(`contrast ${label}: ${l.ratio}:1 ${l.el} ${l.fs}px "${l.text}" ${l.fg} on ${l.bg}`)
  if (r.low.length > 8) problems.push(`contrast ${label}: ${r.low.length - 8} more under 4.5:1`)
  return r
}

// Keyboard walk from the top of the page: press Tab, record what has focus (name, tag, classes) and whether it
// shows a focus ring (outline, or the switch track's outline for the visually hidden checkbox), until the focus
// leaves the document or the walk wraps. `order` is a list of predicates that must match in that order.
async function tabWalk(page, label, order, { ringFor = [], max = 90 } = {}) {
  // Chromium keeps its sequential-focus starting point at the last focused or clicked element, so the walk
  // starts by focusing the first focusable element of the page (the brand link) and tabs on from there.
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('a[href], button, input, select, [tabindex]:not([tabindex="-1"])')?.focus() })
  const seq = []
  for (let i = 0; i < max; i++) {
    if (i) await page.keyboard.press('Tab')
    const f = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const ring = (e) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }
      let hasRing = ring(el)
      if (!hasRing && el.matches('.switch input') && el.nextElementSibling) hasRing = ring(el.nextElementSibling)
      const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) || `<${el.tagName.toLowerCase()}${el.type ? ':' + el.type : ''}>`
      return { name, tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className : '', fv: el.matches(':focus-visible'), ring: hasRing }
    })
    if (!f) { if (seq.length) break; continue }
    if (seq.length && f.name === seq[0].name && f.cls === seq[0].cls && f.tag === seq[0].tag) break
    seq.push({ ...f, fv: i ? f.fv : true, ring: i ? f.ring : true }) // stop 0 was focused by script, not by Tab
  }
  const has = (p) => (f) => (!p.cls || f.cls.split(/\s+/).includes(p.cls)) && (!p.name || p.name.test(f.name))
  let at = 0
  const misses = []
  for (const p of order) {
    const i = seq.findIndex((f, idx) => idx >= at && has(p)(f))
    if (i < 0) misses.push(p.label)
    else at = i + 1
  }
  if (misses.length) problems.push(`tab order ${label}: not reached in order: ${misses.join(', ')} (walked ${seq.length}: ${seq.map((f) => f.name).join(' → ')})`)
  for (const p of ringFor) {
    const f = seq.find(has(p))
    if (!f) problems.push(`focus ring ${label}: ${p.label} was never focused by Tab`)
    else if (!f.fv || !f.ring) problems.push(`focus ring ${label}: ${p.label} focused without a visible ring (focus-visible=${f.fv}, outline=${f.ring})`)
  }
  console.log(`tab walk ${label} (${seq.length} stops): ${seq.map((f) => f.name + (f.ring ? '' : ' [no ring]')).join(' → ')}`)
  return seq
}

// Step 8: the card shows RUN NORTHSTAR AI instead of Next; pressing it opens the run moment over the map.
// With a name, captures during the solver-log replay (a few lines in); then waits for the reveal button.
async function pressRunAndSee(page, shotName) {
  await page.click('.demo-actions .demo-run')
  await page.waitForSelector('.run-moment', { timeout: 30000 })
  if (shotName) {
    await page.waitForFunction(() => document.querySelectorAll('.run-moment .rm-line').length >= 4, null, { timeout: 120000 })
    await shot(page, shotName)
  }
  await page.waitForSelector('.run-moment .rm-foot.show .btn.accent:not([disabled])', { timeout: 120000 })
  await page.click('.run-moment .rm-foot .btn.accent')
}
const atStep = (page, n) => page.waitForFunction((n) => {
  const meta = document.querySelector('.demo-meta .eyebrow')
  const busy = document.querySelector('.demo-caption .spinner')
  const dlg = document.querySelector('.demo')
  return !!meta && meta.textContent.includes(`step ${n} of`) && !busy && dlg && !dlg.hidden
}, n, { timeout: 120000 })

async function checkNoHorizontalScroll(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  if (r.sw > r.iw) problems.push(`${label}: horizontal overflow (scrollWidth ${r.sw}px > viewport ${r.iw}px)`)
}

async function scrollToSection(page, selector, offset = 40) {
  const ok = await page.evaluate(({ sel, offset }) => {
    const el = document.querySelector(sel)
    if (!el) return false
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset)
    return true
  }, { sel: selector, offset })
  if (!ok) problems.push(`landing: section ${selector} not found`)
  await page.waitForTimeout(600)
}

// ---- 0. Landing site --------------------------------------------------------
// 0a. Hero with the coastline at 1440, in the DISRUPTED phase of the loop; then the page scrolled
//     to the method section under the glass header.
const h1440 = await newPage({ width: 1440, height: 900 }, { label: 'landing-1440' })
await h1440.goto(url('#/'))
await h1440.waitForSelector('.hero', { timeout: 30000 })
const coastOk = await h1440.waitForSelector('.loop-svg .coast-nunavut', { timeout: 30000 }).then(() => true).catch(() => false)
if (!coastOk) problems.push('hero: coastline path (.coast-nunavut) did not render')
await h1440.waitForSelector('.loop-state.disrupted', { timeout: 15000 }).catch(() => problems.push('hero: DISRUPTED phase not reached within 15 s'))
await h1440.waitForTimeout(900) // let the phase transition settle
await shot(h1440, 'hero-coast')
await checkNoHorizontalScroll(h1440, 'home 1440')
await scrollToSection(h1440, '#method')
await h1440.waitForSelector('.site-hdr.scrolled', { timeout: 5000 }).catch(() => problems.push('landing: header did not switch to its scrolled (glass) state'))
await h1440.waitForTimeout(500) // section reveal
await shot(h1440, 'site-scrolled')
await h1440.close()

const home = await newPage(undefined, { label: 'landing' })
await home.goto(url('#/'))
await home.waitForSelector('.hero', { timeout: 30000 })
await home.waitForFunction(() => !!document.querySelector('.loop-svg, .loop-placeholder'), null, { timeout: 30000 })
await home.waitForTimeout(1800) // fonts, first loop state
await shot(home, 'home-hero')
await checkNoHorizontalScroll(home, 'home 1600')
await a11yAudit(home, 'home')
await contrastAudit(home, 'home')
await scrollToSection(home, '#situation')
await shot(home, 'home-problem')
await scrollToSection(home, '#method')
await shot(home, 'home-how')
await home.waitForSelector('#evidence .ev-card, #evidence .ev-note', { timeout: 30000 })
await scrollToSection(home, '#evidence')
await shot(home, 'home-evidence')
await scrollToSection(home, '#data')
await shot(home, 'home-data')

await home.goto(url('#/data'))
await home.waitForSelector('.ds-table, .data-page .ev-note', { timeout: 30000 })
await home.waitForTimeout(600)
await shot(home, 'data', { fullPage: true })
await checkNoHorizontalScroll(home, 'data 1600')
await a11yAudit(home, 'data')
await contrastAudit(home, 'data')
// V4: the provenance table (one row per dataset, REAL / DERIVED / SYNTHETIC) at a taller viewport
await home.setViewportSize({ width: 1600, height: 1300 })
await home.waitForSelector('.prov-table', { timeout: 30000 })
await scrollToSection(home, 'section[aria-labelledby="prov-h"]', 96) // clear of the fixed site header
await shot(home, 'data-page')
const provRows = await home.locator('.prov-table tbody tr').count()
if (provRows < 8) problems.push(`data-page: expected at least 8 provenance rows, found ${provRows}`)

await home.goto(url('#/about'))
await home.waitForSelector('.rai-hero', { timeout: 30000 })
await home.waitForTimeout(600)
await scrollToSection(home, '#limitations', 96)
await shot(home, 'about-page')
await home.setViewportSize({ width: 1600, height: 1000 })
await home.evaluate(() => window.scrollTo(0, 0))
await home.waitForTimeout(400)
await shot(home, 'about', { fullPage: true })
await checkNoHorizontalScroll(home, 'about 1600')
await a11yAudit(home, 'about')
await contrastAudit(home, 'about')
await home.close()

// Mobile landing (390 x 844) and a tablet width check (768)
const mob = await newPage({ width: 390, height: 844 }, { label: 'landing-390' })
await mob.goto(url('#/'))
await mob.waitForSelector('.hero', { timeout: 30000 })
await mob.waitForFunction(() => !!document.querySelector('.loop-svg, .loop-placeholder'), null, { timeout: 30000 })
await mob.waitForSelector('#evidence .ev-card, #evidence .ev-note', { timeout: 30000 })
await mob.waitForTimeout(1200)
await revealAll(mob)
await shot(mob, 'home-mobile-390', { fullPage: true })
await checkNoHorizontalScroll(mob, 'home 390')
await mob.setViewportSize({ width: 768, height: 1024 })
await mob.waitForTimeout(600)
await checkNoHorizontalScroll(mob, 'home 768')
await mob.close()

// ---- 0b. First-entry onboarding dialog and the app header -------------------
const onb = await newPage({ width: 1600, height: 1000 }, { onboarded: false, label: 'onboarding' })
await onb.goto(url('#/simulation'))
await onb.waitForSelector('.onboard', { timeout: 30000 })
await onb.waitForSelector('.annunciator', { timeout: 30000 })
await onb.waitForTimeout(1200)
await shot(onb, 'onboarding')
await onb.keyboard.press('Escape') // = "Explore on my own"
await onb.waitForSelector('.onboard', { state: 'detached', timeout: 5000 })
await waitMarkers(onb)
await onb.waitForTimeout(600)
await onb.screenshot({ path: path.join(OUT, 'app-header.png'), clip: { x: 0, y: 0, width: 1600, height: 90 } })
await onb.close()

// ---- 0c. Research story, section by section, and the "Open in simulator" round trip ------
// Expected values come from the same API the page reads, so the assertions are data-driven.
const summary = await (await fetch(`${BASE}/api/experiments/latest`)).json().catch(() => null)
const pr = await newPage({ width: 1600, height: 1000 }, { label: 'research' })
await pr.goto(url('#/research'))
const storyOk = await pr.waitForSelector('.rs-story', { timeout: 60000 }).then(() => true).catch(() => false)
if (!storyOk) problems.push(`research: the story did not render within 60 s (${(await pr.textContent('.rs-state').catch(() => null)) ?? 'no state card'})`)
else {
  await pr.waitForTimeout(900)
  await a11yAudit(pr, 'research')
  await contrastAudit(pr, 'research')
  // The top of the story: question, method diagram and the three headline numbers, in one tall clip.
  const hl = await pr.locator('#rs-headline').boundingBox()
  await shot(pr, 'research-story', { fullPage: true, clip: { x: 0, y: 0, width: 1600, height: Math.ceil((hl?.y ?? 0) + (hl?.height ?? 1000) + 24) } })
  // Element shots scroll the section under the fixed site header; hide the header while taking them.
  await pr.evaluate(() => { const h = document.querySelector('.site-hdr'); if (h) h.style.visibility = 'hidden' })
  await pr.locator('#rs-strips').screenshot({ path: path.join(OUT, 'research-strips.png') })
  await pr.locator('#rs-losses').screenshot({ path: path.join(OUT, 'research-losses.png') })
  await pr.locator('#rs-solver').screenshot({ path: path.join(OUT, 'research-solver.png') })
  await pr.evaluate(() => { const h = document.querySelector('.site-hdr'); if (h) h.style.visibility = '' })
  // Every strip draws one tick per scenario.
  const ticks = await pr.evaluate(() => [...document.querySelectorAll('.pd-svg')].map((s) => s.querySelectorAll('rect').length - 1))
  const n = summary?.n_scenarios ?? 100
  if (ticks.length === 0 || ticks.some((t) => t !== n)) problems.push(`research-strips: expected ${n} ticks per strip, got ${ticks.join(',')}`)
  // The solver buckets sum to the total.
  if (!(await pr.$('.solver-legend .sum.ok'))) problems.push('research-solver: the four solver buckets do not sum to the total')
  // Explorer: sort by the first metric header (worst for NORTHSTAR first) and check the top row is a loss when losses exist.
  await pr.evaluate(() => document.getElementById('rs-explorer')?.scrollIntoView({ block: 'start' }))
  await pr.waitForTimeout(300)
  // V5: the default column set is the six resilience metrics, reroutes included (where NORTHSTAR loses).
  const explorerHeads = await pr.$$eval('.rs-table.explorer thead th .th-sort', (bs) => bs.map((b) => b.textContent.replace(/[▼▲↕]/g, '').trim()))
  if (explorerHeads.length !== 6 || !explorerHeads.some((h) => /reroute/i.test(h))) problems.push(`research-explorer: expected 6 default metric columns including reroutes, got ${explorerHeads.length}: ${explorerHeads.join(' | ')}`)
  const segLabels = await pr.$$eval('.explorer-tools .seg button', (bs) => bs.map((b) => b.textContent.trim()))
  if (!/^Resilience 6$/.test(segLabels[0] ?? '') || !/^All 10$/.test(segLabels[1] ?? '')) problems.push(`research-explorer: column toggles read ${segLabels.join(' / ')}, expected "Resilience 6" / "All 10"`)
  await pr.click('.rs-table.explorer th .th-sort')
  await pr.waitForSelector('.rs-table.explorer th.sorted', { timeout: 5000 })
  const firstKey = 'disconnected_community_hours'
  const comp = summary?.comparisons?.[summary.primary_policy]?.[firstKey]
  const topCls = await pr.getAttribute('.rs-table.explorer tbody tr:first-child td.pair', 'class')
  if (comp && comp.losses > 0 && !/\bloss\b/.test(topCls ?? '')) problems.push(`research-explorer: sorted worst-first but the top row is not a loss (${topCls})`)
  await pr.evaluate(() => window.scrollTo(0, (document.getElementById('rs-explorer')?.getBoundingClientRect().top ?? 0) + window.scrollY - 40))
  await pr.waitForTimeout(300)
  await shot(pr, 'research-explorer')
  // Open in simulator: the first row of the losses table (or the explorer if there is none) must load that scenario.
  const btn = (await pr.$('.rs-table.losses .open-sim')) ?? (await pr.$('.rs-table.explorer .open-sim'))
  const rowId = btn ? await btn.evaluate((b) => b.closest('tr')?.querySelector('td')?.textContent?.trim() ?? '') : ''
  if (!btn || !rowId) problems.push('research: no "Open in simulator" button found')
  else {
    const expected = await (await fetch(`${BASE}/api/experiments/scenarios/${encodeURIComponent(rowId)}`)).json()
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    await pr.waitForFunction(() => window.location.hash.startsWith('#/simulation'), null, { timeout: 30000 })
    await pr.waitForSelector('.annunciator', { timeout: 30000 })
    await pr.waitForFunction((name) => document.querySelector('.scenario-name')?.textContent === name, expected.name, { timeout: 30000 })
      .catch(() => problems.push(`open-in-simulator: header scenario name did not become "${expected.name}"`))
    const annState = await pr.textContent('.ann-state')
    if (annState === 'NORMAL') problems.push('open-in-simulator: network state stayed NORMAL after loading a disrupted scenario')
    // V5: the scenario card compacts the generator's count list and names the experiment row.
    const cardText = await pr.textContent('.scenario-card').catch(() => '')
    if (/\(s\)/.test(cardText ?? '')) problems.push(`open-in-simulator: scenario card still shows the raw "(s)" description: ${cardText}`)
    const expLineOk = await pr.waitForFunction(() => /Scenario \d+ of the [\d,]+-scenario experiment \(seed \d+\); the run buttons solve it live\./.test(document.querySelector('.scenario-card')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true).catch(() => false)
    if (!expLineOk) problems.push(`open-in-simulator: the "Scenario n of the N-scenario experiment" sentence did not appear: ${await pr.textContent('.scenario-card').catch(() => '')}`)
    const session = await (await fetch(`${BASE}/api/scenario`)).json()
    if (session?.scenario?.id !== rowId) problems.push(`open-in-simulator: session scenario is ${session?.scenario?.id}, expected ${rowId}`)
    if (!(session?.scenario?.disruptions?.length > 0)) problems.push('open-in-simulator: loaded scenario has no disruptions')
    if (expected.disruptions?.length && session?.scenario?.disruptions?.length !== expected.disruptions.length) problems.push(`open-in-simulator: ${session?.scenario?.disruptions?.length} disruptions loaded, expected ${expected.disruptions.length}`)
    await waitMarkers(pr)
    await waitMapIdle(pr)
    await pr.waitForTimeout(1200)
    await shot(pr, 'research-open-sim')
    // Reset through the UI so the session is healthy for the demo flow.
    await pr.click('.scenario-simple .btn.ghost')
    await waitIdle(pr)
    await pr.waitForFunction(() => document.querySelector('.ann-state')?.textContent === 'NORMAL', null, { timeout: 30000 })
      .catch(() => problems.push('open-in-simulator: Reset did not return the network to NORMAL'))
    const after = await (await fetch(`${BASE}/api/scenario`)).json()
    if (after?.scenario?.disruptions?.length) problems.push('open-in-simulator: session still has disruptions after Reset')
  }
}
await pr.close()

// ---- 1. Simple mode, healthy: the preset cards --------------------------------
const page = await newPage(undefined, { label: 'demo' })
await page.goto(url('#/simulation'))
await page.waitForSelector('.annunciator', { timeout: 30000 })
await waitMarkers(page)
// Start from a healthy network so the cards (not the compact scenario card) are visible.
if (await page.$('.scenario-simple .btn.ghost')) { await page.click('.scenario-simple .btn.ghost'); await waitIdle(page) }
await page.waitForSelector('.preset-card', { timeout: 30000 })
await waitMapIdle(page)
await page.waitForTimeout(1500) // basemap tiles/labels
await shot(page, 'presets')
// V5: the legend is expanded by default at 1600, collapses from the keyboard, remembers the choice, and re-opens.
if (!(await page.$('.map-legend.open .legend-toggle[aria-expanded="true"]'))) problems.push('legend: not expanded by default at 1600 px')
await page.focus('.legend-toggle')
await page.keyboard.press('Enter')
await page.waitForSelector('.legend-toggle[aria-expanded="false"]', { timeout: 3000 }).catch(() => problems.push('legend: Enter on the toggle did not collapse it'))
if (await page.evaluate(() => localStorage.getItem('northstar.legend')) !== '0') problems.push('legend: collapsed state was not remembered in localStorage northstar.legend')
if (await page.$('#map-legend-items:not([hidden])')) problems.push('legend: items still rendered while collapsed')
await page.keyboard.press('Space')
await page.waitForSelector('.legend-toggle[aria-expanded="true"]', { timeout: 3000 }).catch(() => problems.push('legend: Space on the toggle did not expand it'))
// The Sanikiluaq label (bottom of the map) must be visible now that the legend lives bottom-left.
const sanik = await page.evaluate(() => { const l = [...document.querySelectorAll('.map-label')].find((e) => e.textContent === 'Sanikiluaq'); if (!l) return 'missing'; const r = l.getBoundingClientRect(); const lg = document.querySelector('.map-legend')?.getBoundingClientRect(); const hit = lg && r.left < lg.right && r.right > lg.left && r.top < lg.bottom && r.bottom > lg.top; return l.style.visibility === 'hidden' ? 'hidden' : hit ? 'under legend' : 'ok' })
if (sanik !== 'ok') problems.push(`map: Sanikiluaq label is ${sanik} at 1600 px`)
// Keyboard: header → preset cards → map corner → action stack → timeline, every stop with a visible ring.
await tabWalk(page, 'simple mode, healthy', [
  { label: 'header demo button', cls: 'demo-btn' },
  { label: 'preset card', cls: 'preset-main' },
  { label: 'preset card demo link', cls: 'preset-demo' },
  { label: 'legend toggle', cls: 'legend-toggle' },
  { label: 'Start guided demo', cls: 'act-demo' },
  { label: 'RUN NORTHSTAR AI', cls: 'run-btn', name: /RUN NORTHSTAR AI/ },
  { label: 'timeline play', cls: 'play' },
  { label: 'timeline scrubber', name: /^Simulation time$/ },
], { ringFor: [
  { label: 'Advanced switch', name: /^<input:checkbox>$/ }, // the checkbox itself has no class; its label is .switch
  { label: 'preset card', cls: 'preset-main' }, { label: 'preset card demo link', cls: 'preset-demo' },
  { label: 'legend toggle', cls: 'legend-toggle' }, { label: 'RUN NORTHSTAR AI', cls: 'run-btn', name: /RUN NORTHSTAR AI/ },
  { label: 'timeline scrubber', name: /^Simulation time$/ },
] })

// ---- 2. Guided demo, ten steps ---------------------------------------------
const demoT0 = Date.now()
let checkMs = 0 // time spent in the V5 checks inside the loop (tab walks, collision check, 1280 shots), reported separately
const timed = async (fn) => { const t = Date.now(); await fn(); checkMs += Date.now() - t }
await page.click('button.demo-btn')

// V5: the same command centre at 1280 × 900 (the docked card in the 440 px column), shot and overflow-checked,
// then the viewport goes back to 1600 so the rest of the demo pictures are unchanged.
const networkForFit = await (await fetch(`${BASE}/api/network`)).json().catch(() => null)
async function narrowShot(page, name) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForTimeout(900) // resize handlers (dock, map.resize), layout
  // A page opened at 1280 fits the populated south (MapView: tall map column → airports below 72° N); a resized
  // page keeps its 1600 view, so apply that same fit for the picture and restore the view afterwards.
  const prevView = await page.evaluate((airports) => {
    const m = window.__northstarMap
    if (!m || !airports) return null
    const before = { center: m.getCenter().toArray(), zoom: m.getZoom() }
    const fit = airports.filter((a) => a.region !== 'South gateway' && a.lat < 72)
    const lons = fit.map((a) => a.lon), lats = fit.map((a) => a.lat)
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 40, bottom: 70, left: 60, right: 60 }, duration: 0 })
    return before
  }, networkForFit?.airports ?? null)
  if (!(await page.$('#demo-dock .demo.docked'))) problems.push(`${name}: the demo card is not docked in the right column at 1280 px`)
  const colW = await page.evaluate(() => document.querySelector('.cc-right')?.getBoundingClientRect().width ?? 0)
  if (Math.round(colW) !== 440) problems.push(`${name}: right column is ${colW}px wide at 1280, expected 440`)
  // Nothing in the right column may be wider than the column (a wrapped RUN button, a clipped result row, an overflowing tile).
  const wide = await page.evaluate(() => { const col = document.querySelector('.cc-right'); if (!col) return []; const cw = col.getBoundingClientRect().right + 1; return [...col.querySelectorAll('*')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > cw).map((e) => `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').split(/\s+/)[0]} right=${Math.round(e.getBoundingClientRect().right)}`).slice(0, 6) })
  if (wide.length) problems.push(`${name}: elements overflow the right column at 1280: ${wide.join(', ')}`)
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.cc-right .result-label, .cc-right .tile-label, .cc-right .btn, .cc-right .run-legend')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => `${e.className.split(/\s+/)[0]}:"${e.textContent.trim().slice(0, 30)}"`).slice(0, 6))
  if (clipped.length) problems.push(`${name}: text clipped at 1280: ${clipped.join(', ')}`)
  // A page opened below 1440 starts with the legend collapsed (this page was opened at 1600, so fold it for the
  // picture and unfold it afterwards), and the docked card's action row is scrolled into view when the column
  // is taller than the viewport.
  const legendWasOpen = !!(await page.$('.legend-toggle[aria-expanded="true"]'))
  if (legendWasOpen) await page.click('.legend-toggle')
  await page.evaluate(() => document.querySelector('#demo-dock .demo-actions')?.scrollIntoView({ block: 'end' }))
  await page.waitForTimeout(1200) // not waitMapIdle: during playback the trails are rewritten every frame, so the map never idles
  await shot(page, name)
  await checkNoHorizontalScroll(page, `simulation 1280 (${name})`)
  if (legendWasOpen) await page.click('.legend-toggle')
  await page.evaluate(() => document.querySelector('.cc-right')?.scrollTo(0, 0))
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.waitForTimeout(700)
  if (prevView) await page.evaluate((v) => window.__northstarMap?.easeTo({ center: v.center, zoom: v.zoom, duration: 0 }), prevView)
}

for (let i = 1; i <= 10; i++) {
  await atStep(page, i)
  // let playback animate for the two "play" steps so aircraft are airborne in the picture;
  // step 9 first takes the zoomed map detail while the morning wildfire is still active (~09:00–12:00 at 2×)
  if (i === 9) { await page.waitForTimeout(1400); await mapDetail(page); await page.waitForTimeout(1000) }
  else await page.waitForTimeout(i === 7 ? 4000 : 1400)
  await shot(page, `step-${String(i).padStart(2, '0')}`)
  const err = await page.$('.demo-error')
  if (err) problems.push(`demo step ${i} showed an error: ${await err.textContent()}`)
  if (i === 8) {
    // The guided-demo dialog is labelled; the keyboard reaches Back and RUN NORTHSTAR AI inside the docked card.
    const dlg = await page.evaluate(() => { const d = document.querySelector('.demo[role="dialog"]'); return d ? (d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || '') : null })
    if (dlg === null) problems.push('demo: the guided-demo card has no role="dialog"')
    else if (!dlg) problems.push('demo: the guided-demo dialog has no aria-label / aria-labelledby')
    await timed(() => tabWalk(page, 'docked demo, step 8', [
      { label: 'header demo button', cls: 'demo-btn' },
      { label: 'docked Back', name: /^Back$/ },
      { label: 'docked RUN NORTHSTAR AI', cls: 'demo-run' },
      { label: 'timeline play', cls: 'play' },
    ], { ringFor: [{ label: 'docked Back', name: /^Back$/ }, { label: 'docked RUN NORTHSTAR AI', cls: 'demo-run' }] }))
    await pressRunAndSee(page, 'step-08-run')
    continue
  }
  if (i === 9) {
    const t9 = Date.now()
    await narrowShot(page, 'narrow-1280') // first, while the clock is still mid-afternoon
    await tabWalk(page, 'docked demo, step 9', [
      { label: 'header demo button', cls: 'demo-btn' },
      { label: 'docked Back', name: /^Back$/ },
      { label: 'docked Next', name: /^Next/ },
      { label: 'timeline play', cls: 'play' },
    ], { ringFor: [{ label: 'docked Back', name: /^Back$/ }, { label: 'docked Next', name: /^Next/ }] })
    // No mission marker may touch a hub label, and no visible community label may touch a hub label, a mission
    // marker or a parked aircraft (the V5 declutter rule), at the full-network zoom.
    const collisions = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect()
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const hubs = [...document.querySelectorAll('.map-label.hub')].map((e) => ({ n: e.textContent, r: box(e) }))
      const coms = [...document.querySelectorAll('.map-label:not(.hub)')].filter((e) => e.style.visibility !== 'hidden').map((e) => ({ n: e.textContent, r: box(e) }))
      const missions = [...document.querySelectorAll('.mission-marker')].map((e) => ({ n: e.title, r: box(e) }))
      const parked = [...document.querySelectorAll('.ac-marker')].filter((e) => !e.classList.contains('flying')).map((e) => ({ n: e.title, r: box(e) }))
      const out = []
      for (const m of missions) for (const h of hubs) if (hit(m.r, h.r)) out.push(`mission "${m.n}" over hub label ${h.n}`)
      for (const c of coms) {
        for (const h of hubs) if (hit(c.r, h.r)) out.push(`label ${c.n} over hub label ${h.n}`)
        for (const m of missions) if (hit(c.r, m.r)) out.push(`label ${c.n} over mission "${m.n}"`)
        for (const p of parked) if (hit(c.r, p.r)) out.push(`label ${c.n} over parked ${p.n}`)
      }
      return out
    })
    if (collisions.length) problems.push(`map declutter (step 9): ${collisions.join('; ')}`)
    checkMs += Date.now() - t9
  }
  if (i === 10) await timed(() => narrowShot(page, 'narrow-1280-why'))
  if (i < 10) await page.click('.demo-actions .btn.accent')
}
const demoWallMs = Date.now() - demoT0
console.log(`guided demo wall time, step 1 → step 10 (including per-step screenshot pauses): ${((demoWallMs - checkMs) / 1000).toFixed(1)} s net (${(demoWallMs / 1000).toFixed(1)} s including ${(checkMs / 1000).toFixed(1)} s of V5 tab walks, collision check and 1280 px shots)`)
// Step 10's button parks the demo on the Research page with a "Back to the demo" toast.
await page.click('.demo-body .btn.accent')
await page.waitForSelector('.demo-resume', { timeout: 15000 })
await page.waitForSelector('.rs-story, .rs-empty', { timeout: 60000 })
await page.waitForTimeout(800)
await shot(page, 'research', { fullPage: true })
await page.click('.demo-resume .btn.accent')
await atStep(page, 10)
await page.waitForTimeout(600)
await page.click('.demo-actions .btn.ghost') // Exit

// ---- 3. Simple mode after a NORTHSTAR run; result card; why card -------------
await page.waitForTimeout(600)
await page.evaluate(() => document.querySelector('.cc-right')?.scrollTo(0, 0))
await page.waitForTimeout(300)
await shot(page, 'simple-mode')
await a11yAudit(page, 'simulation (simple mode, NORTHSTAR run)')
await contrastAudit(page, 'simulation (simple mode, NORTHSTAR run)')
await page.evaluate(() => document.querySelector('.result-card')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
{ const clip = await clipTo(page, '.result-card'); if (clip) await shot(page, 'result-card', { clip }); else problems.push('result-card not found') }
await page.evaluate(() => document.querySelector('.why-panel')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
{ const clip = await clipTo(page, '.why-panel'); if (clip) await shot(page, 'why-card', { clip }); else problems.push('why-panel not found') }
// V4: the alternatives expanded into the table of every candidate aircraft with the optimizer's reason.
if (await page.$('.why-panel .why-alts .link')) {
  await page.click('.why-panel .why-alts .link')
  await page.waitForSelector('.why-panel .alts-table', { timeout: 5000 })
  await page.waitForTimeout(300)
  const rows = await page.locator('.why-panel .alts-table tbody tr').count()
  const fleet = (await (await fetch(`${BASE}/api/network`)).json().catch(() => null))?.aircraft?.length ?? 0
  if (rows === 0) problems.push('why-alternatives: the candidate table is empty')
  if (fleet && rows !== fleet) problems.push(`why-alternatives: ${rows} rows for a fleet of ${fleet}`)
  await page.setViewportSize({ width: 1600, height: 1700 })
  await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelector('.why-panel')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(400)
  const clip = await clipTo(page, '.why-panel'); if (clip) await shot(page, 'why-alternatives', { clip })
  await page.click('.why-panel .why-alts .link')
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.waitForTimeout(500)
} else problems.push('why-alternatives: no "Alternatives considered" toggle in the why card')

// ---- 4. The run moment from the panel button (simple mode) -------------------
await page.evaluate(() => document.querySelector('.cc-right')?.scrollTo(0, 0))
await page.click('.actions .run-btn.northstar')
await page.waitForSelector('.run-moment', { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.run-moment .rm-line').length >= 6, null, { timeout: 120000 })
await shot(page, 'run-moment')
await page.waitForSelector('.run-moment .rm-foot.show .btn.accent:not([disabled])', { timeout: 120000 })
await page.click('.run-moment .rm-foot .btn.accent')
await page.waitForSelector('.run-moment', { state: 'detached', timeout: 5000 })

// ---- 5. Advanced mode (same state) -------------------------------------------
// The checkbox itself is visually hidden; the label's track is the click target.
await page.click('.switch .switch-track')
await page.waitForSelector('.cc.advanced', { timeout: 5000 })
await page.waitForTimeout(800)
await shot(page, 'advanced-mode')
await page.click('.switch .switch-track')
await page.waitForSelector('.cc.simple', { timeout: 5000 })

// ---- 6. Responsible AI (About anchor), command centre -------------------------
await page.goto(url('#/about#responsible-ai'))
await page.waitForSelector('.rai-hero', { timeout: 30000 })
await page.waitForTimeout(800)
await shot(page, 'responsible-ai')
await page.goto(url('#/simulation'))
await page.waitForSelector('.annunciator', { timeout: 30000 })
await page.evaluate(() => { document.querySelector('.cc-right')?.scrollTo(0, 0); document.querySelector('.cc-left')?.scrollTo(0, 0) })
await waitMapIdle(page)
await page.waitForTimeout(800)
await shot(page, 'command-center')
await page.close()

// ---- 6b. Reduced motion: the same step 9 with prefers-reduced-motion. The flow loop must never have run and
//     no CSS animation may be running once the page has settled (MapLibre draws on its canvas, not with CSS).
const pRm = await newPage({ width: 1600, height: 1000 }, { label: 'reduced-motion' })
await pRm.emulateMedia({ reducedMotion: 'reduce' })
await pRm.goto(url('#/simulation?demo=1'))
await pRm.waitForSelector('.annunciator', { timeout: 30000 })
for (let i = 1; i <= 9; i++) {
  await atStep(pRm, i)
  const err = await pRm.$('.demo-error')
  if (err) problems.push(`reduced-motion step ${i} showed an error: ${await err.textContent()}`)
  if (i === 8) { await pressRunAndSee(pRm); continue }
  if (i < 9) await pRm.click('.demo-actions .btn.accent')
}
await waitMarkers(pRm)
await pRm.waitForTimeout(2000) // step 9 is playing at 2×: assert while the timeline is running, not after the day has ended
const rm = await pRm.evaluate(() => {
  const own = (a) => { const t = a.effect?.target; return !(t && t.closest && t.closest('.maplibregl-canvas-container, .maplibregl-ctrl')) }
  const all = document.getAnimations()
  const running = all.filter((a) => a.playState === 'running' && own(a)).map((a) => `${a.constructor.name} ${a.animationName ?? a.transitionProperty ?? ''} on ${a.effect?.target?.className ?? '?'}`)
  const f = window.__northstarFlow
  return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, flow: f ? { running: f.running, ticks: f.ticks } : null, total: all.length, running, playing: document.querySelector('.btn.play')?.getAttribute('aria-label') }
})
if (!rm.reduced) problems.push('reduced-motion: the page did not see prefers-reduced-motion: reduce')
if (!rm.flow) problems.push('reduced-motion: window.__northstarFlow is not exposed')
else if (rm.flow.running || rm.flow.ticks > 0) problems.push(`reduced-motion: the flow loop ran (running=${rm.flow.running}, ticks=${rm.flow.ticks})`)
if (rm.running.length) problems.push(`reduced-motion: ${rm.running.length} CSS animation(s) still running: ${rm.running.slice(0, 5).join('; ')}`)
console.log(`reduced motion at step 9: flow running=${rm.flow?.running} ticks=${rm.flow?.ticks} · document.getAnimations(): ${rm.total} total, ${rm.running.length} running · timeline ${rm.playing === 'Pause' ? 'playing' : 'paused'}`)
await shot(pRm, 'reduced-motion')
await pRm.close()

// ---- 7. Failure states ------------------------------------------------------
// 7a. experiments missing (404) -> explanatory empty state on the Research page
const p404 = await newPage({ width: 1600, height: 1000 }, { label: 'research-404', expectFailures: true })
await p404.route('**/api/experiments/latest', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: { error: 'no experiment results', detail: 'run experiments/run_experiments.py' } }) }))
await p404.goto(url('#/research'))
await p404.waitForSelector('.rs-empty', { timeout: 30000 })
await shot(p404, 'research-empty')
await p404.close()

// 7b. backend unreachable after load -> banner, controls disabled, last state kept
const pDown = await newPage({ width: 1600, height: 1000 }, { label: 'backend-down', expectFailures: true })
await pDown.goto(url('#/simulation'))
await waitMarkers(pDown)
await pDown.route('**/api/**', (r) => r.abort('connectionrefused'))
await pDown.waitForSelector('.conn-banner', { timeout: 15000 })
await pDown.waitForTimeout(400)
await shot(pDown, 'backend-down')
await pDown.close()

// 7c. narrow layout (below 1280px) degrades to a single column
const pNarrow = await newPage({ width: 1024, height: 1400 }, { label: 'narrow-1024' })
await pNarrow.goto(url('#/simulation'))
await waitMarkers(pNarrow)
await waitMapIdle(pNarrow)
await pNarrow.waitForTimeout(2500) // headless software WebGL can still be finishing its first frames
await shot(pNarrow, 'narrow-1024')
await checkNoHorizontalScroll(pNarrow, 'simulation 1024')
await pNarrow.close()

await browser.close()
console.log(`screenshots written to ${OUT}`)
if (external.size) { console.log('EXTERNAL REQUESTS (should be none):'); for (const u of external) console.log('  ' + u) } else console.log('no external requests observed')
if (expected.length) { console.log('expected failures on the failure-state pages:'); for (const p of expected) console.log('  ' + p) }
if (problems.length) { console.log('PROBLEMS:'); for (const p of problems) console.log('  ' + p); process.exitCode = 1 } else console.log('no page errors, console errors or failed requests')
