// Drives the full 10-step Demo Mode in headless Chromium and saves one PNG per
// step, plus the Research and Responsible AI views and two failure states.
//
//   node scripts/demo_screenshots.mjs            (dev server on :5173, backend on :8000)
//   BASE_URL=http://localhost:8000 node scripts/demo_screenshots.mjs   (production build served by the backend)
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.OUT_DIR ?? path.resolve(HERE, '../../docs/screenshots')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const problems = []
const external = new Set()

async function newPage(viewport = { width: 1600, height: 1000 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`) })
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') external.add(r.url())
  })
  return page
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

// ---- 1. Demo mode, ten steps -------------------------------------------------
const page = await newPage()
await page.goto(BASE)
await page.waitForSelector('.annunciator', { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.ac-marker').length >= 10, null, { timeout: 60000 })
await page.waitForTimeout(1500) // basemap tiles/labels
await page.click('button.demo-btn')

for (let i = 1; i <= 10; i++) {
  await page.waitForFunction((n) => {
    const meta = document.querySelector('.demo-meta .eyebrow')
    const busy = document.querySelector('.demo-caption .spinner')
    return !!meta && meta.textContent.includes(`step ${n} of`) && !busy
  }, i, { timeout: 120000 })
  // let playback animate for the two "play" steps so aircraft are airborne in the picture
  await page.waitForTimeout(i === 4 || i === 6 ? 4000 : 1400)
  await shot(page, `step-${String(i).padStart(2, '0')}`)
  const err = await page.$('.demo-error')
  if (err) problems.push(`demo step ${i} showed an error: ${await err.textContent()}`)
  if (i < 10) await page.click('.demo-actions .btn.accent')
}
await page.click('.demo-actions .btn.ghost') // Exit

// ---- 2. Research + Responsible AI, tall viewport so the internal scroll area is visible
await page.setViewportSize({ width: 1600, height: 2300 })
await page.click('.tab >> text=Research Results')
await page.waitForSelector('.metric-cards, .rs-empty', { timeout: 30000 })
await page.waitForTimeout(1200)
await shot(page, 'research')
await page.click('.tab >> text=Responsible AI')
await page.waitForSelector('.rai-hero')
await page.waitForTimeout(500)
await shot(page, 'responsible-ai')
await page.setViewportSize({ width: 1600, height: 1000 })
await page.click('.tab >> text=Command Center')
await page.waitForTimeout(800)
await shot(page, 'command-center')
await page.close()

// ---- 3. Failure states ------------------------------------------------------
// 3a. experiments missing (404) -> explanatory empty state
const p404 = await newPage({ width: 1600, height: 1000 })
await p404.route('**/api/experiments/latest', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: { error: 'no experiment results', detail: 'run experiments/run_experiments.py' } }) }))
await p404.goto(BASE)
await p404.waitForSelector('.annunciator')
await p404.click('.tab >> text=Research Results')
await p404.waitForSelector('.rs-empty', { timeout: 30000 })
await shot(p404, 'research-empty')
await p404.close()

// 3b. backend unreachable after load -> banner, controls disabled, last state kept
const pDown = await newPage({ width: 1600, height: 1000 })
await pDown.goto(BASE)
await pDown.waitForFunction(() => document.querySelectorAll('.ac-marker').length >= 10, null, { timeout: 60000 })
await pDown.route('**/api/**', (r) => r.abort('connectionrefused'))
await pDown.waitForSelector('.conn-banner', { timeout: 15000 })
await pDown.waitForTimeout(400)
await shot(pDown, 'backend-down')
await pDown.close()

// 3c. narrow layout (below 1280px) degrades to a single column
const pNarrow = await newPage({ width: 1024, height: 1400 })
await pNarrow.goto(BASE)
await pNarrow.waitForFunction(() => document.querySelectorAll('.ac-marker').length >= 10, null, { timeout: 60000 })
await pNarrow.waitForTimeout(1000)
await shot(pNarrow, 'narrow-1024')
await pNarrow.close()

await browser.close()
console.log(`screenshots written to ${OUT}`)
if (external.size) { console.log('EXTERNAL REQUESTS (should be none):'); for (const u of external) console.log('  ' + u) } else console.log('no external requests observed')
if (problems.length) { console.log('PROBLEMS:'); for (const p of problems) console.log('  ' + p); process.exitCode = 1 } else console.log('no page errors, console errors or failed requests')
