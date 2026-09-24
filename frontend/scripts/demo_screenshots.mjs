// Drives the landing site and the ten-step guided demo in headless Chromium and
// saves PNGs: the landing sections (desktop + 390px mobile), Data, About, the
// first-entry onboarding dialog, the app header, one PNG per demo step (step 8
// twice: before pressing RUN and during the solver-log replay), the simple and
// Advanced command centre, the preset cards, the result and why cards, the run
// moment, Research, Responsible AI, three failure states, plus (V3) the hero with
// the coastline at 1440 (hero-coast), the landing scrolled under the glass header
// (site-scrolled) and a zoomed Kivalliq map detail at demo step 9 (map-detail).
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

async function checkNoHorizontalScroll(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  if (r.sw > r.iw) problems.push(`${label}: horizontal overflow (scrollWidth ${r.sw}px > viewport ${r.iw}px)`)
}

async function scrollToSection(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40)
    return true
  }, selector)
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

await home.goto(url('#/about'))
await home.waitForSelector('.rai-hero', { timeout: 30000 })
await home.waitForTimeout(600)
await shot(home, 'about', { fullPage: true })
await checkNoHorizontalScroll(home, 'about 1600')
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

// ---- 2. Guided demo, ten steps ---------------------------------------------
const demoT0 = Date.now()
await page.click('button.demo-btn')
const atStep = (n) => page.waitForFunction((n) => {
  const meta = document.querySelector('.demo-meta .eyebrow')
  const busy = document.querySelector('.demo-caption .spinner')
  const dlg = document.querySelector('.demo')
  return !!meta && meta.textContent.includes(`step ${n} of`) && !busy && dlg && !dlg.hidden
}, n, { timeout: 120000 })

for (let i = 1; i <= 10; i++) {
  await atStep(i)
  // let playback animate for the two "play" steps so aircraft are airborne in the picture;
  // step 9 first takes the zoomed map detail while the morning wildfire is still active (~09:00–12:00 at 2×)
  if (i === 9) { await page.waitForTimeout(1400); await mapDetail(page); await page.waitForTimeout(1000) }
  else await page.waitForTimeout(i === 7 ? 4000 : 1400)
  await shot(page, `step-${String(i).padStart(2, '0')}`)
  const err = await page.$('.demo-error')
  if (err) problems.push(`demo step ${i} showed an error: ${await err.textContent()}`)
  if (i === 8) {
    // The card shows RUN NORTHSTAR AI instead of Next; pressing it opens the run moment over the map.
    await page.click('.demo-actions .demo-run')
    await page.waitForSelector('.run-moment', { timeout: 30000 })
    // Capture during the solver-log replay (a few lines in), then wait for the reveal button.
    await page.waitForFunction(() => document.querySelectorAll('.run-moment .rm-line').length >= 4, null, { timeout: 120000 })
    await shot(page, 'step-08-run')
    await page.waitForSelector('.run-moment .rm-foot.show .btn.accent:not([disabled])', { timeout: 120000 })
    await page.click('.run-moment .rm-foot .btn.accent')
    continue
  }
  if (i < 10) await page.click('.demo-actions .btn.accent')
}
const demoWallMs = Date.now() - demoT0
console.log(`guided demo wall time, step 1 → step 10 (including per-step screenshot pauses): ${(demoWallMs / 1000).toFixed(1)} s`)
// Step 10's button parks the demo on the Research page with a "Back to the demo" toast.
await page.click('.demo-body .btn.accent')
await page.waitForSelector('.demo-resume', { timeout: 15000 })
await page.waitForSelector('.metric-cards, .rs-empty', { timeout: 30000 })
await page.waitForTimeout(800)
await shot(page, 'research', { fullPage: true })
await page.click('.demo-resume .btn.accent')
await atStep(10)
await page.waitForTimeout(600)
await page.click('.demo-actions .btn.ghost') // Exit

// ---- 3. Simple mode after a NORTHSTAR run; result card; why card -------------
await page.waitForTimeout(600)
await page.evaluate(() => document.querySelector('.cc-right')?.scrollTo(0, 0))
await page.waitForTimeout(300)
await shot(page, 'simple-mode')
await page.evaluate(() => document.querySelector('.result-card')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
{ const clip = await clipTo(page, '.result-card'); if (clip) await shot(page, 'result-card', { clip }); else problems.push('result-card not found') }
await page.evaluate(() => document.querySelector('.why-panel')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
{ const clip = await clipTo(page, '.why-panel'); if (clip) await shot(page, 'why-card', { clip }); else problems.push('why-panel not found') }

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
