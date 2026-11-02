// Main-thread sanity check for the map's directional flow + aircraft trails:
// with the NORTHSTAR run displayed and playback at 2×, counts requestAnimationFrame
// callbacks for ~5 s (achieved fps) and confirms the flow loop stops when no run
// is displayed. Headless Chromium falls back to SwiftShader (software WebGL), which
// says nothing about the machine, so the GPU is requested explicitly (ANGLE/Metal on
// macOS); the renderer string is printed so the number can be read in context.
//
//   BASE_URL=http://localhost:8000 node scripts/perf_flow.mjs
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const GPU_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--use-gl=angle', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist']
const browser = await chromium.launch({ args: GPU_ARGS })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.addInitScript(() => { try { sessionStorage.setItem('northstar.onboarded', '1'); localStorage.setItem('northstar.advanced', '0') } catch { /* ignore */ } })
page.on('pageerror', (e) => console.log('pageerror:', e.message))

await page.goto(`${BASE}/#/simulation`)
await page.waitForFunction(() => document.querySelectorAll('.ac-marker').length >= 10, null, { timeout: 60000 })
await page.waitForFunction(() => !document.querySelector('.cc .spinner'), null, { timeout: 120000 })
console.log('renderer:', await page.evaluate(() => {
  const g = document.createElement('canvas').getContext('webgl2')
  const d = g?.getExtension('WEBGL_debug_renderer_info')
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'
}))

// Make sure a NORTHSTAR plan is displayed (loads the primary scenario if the session is healthy).
if (!(await page.$('.annunciator.optimized'))) {
  if (await page.$('.preset-card')) { await page.click('.preset-card .preset-main'); await page.waitForFunction(() => !document.querySelector('.cc .spinner'), null, { timeout: 120000 }) }
  await page.click('.actions .run-btn.northstar')
  await page.waitForSelector('.run-moment .rm-foot.show .btn.accent:not([disabled])', { timeout: 180000 })
  await page.click('.run-moment .rm-foot .btn.accent')
  await page.waitForSelector('.annunciator.optimized', { timeout: 10000 })
}
await page.waitForTimeout(800)

const fps = (ms) => page.evaluate((ms) => new Promise((res) => {
  let n = 0; const t0 = performance.now()
  const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)) }
  requestAnimationFrame(f)
}), ms)
const flow = () => page.evaluate(() => ({ running: window.__northstarFlow?.running ?? null, ticks: window.__northstarFlow?.ticks ?? null }))

console.log('flow with NORTHSTAR displayed:', await flow())
console.log(`idle + flow: ${(await fps(2000)).toFixed(1)} fps`)
// playback at 2× (speed segment is folded behind "⋯" in simple mode)
if (!(await page.$('.seg.speed'))) await page.click('.tl-more')
await page.click('.seg.speed button:nth-child(3)')
await page.evaluate(() => document.querySelector('.tl-track input[type=range]').focus())
await page.click('.btn.play')
await page.waitForTimeout(300)
const f5 = await fps(5000)
const t = await page.evaluate(() => document.querySelector('.tl-clock')?.textContent)
console.log(`playback 2× + flow + trails, 5 s: ${f5.toFixed(1)} fps (clock now ${t})`)
await page.click('.btn.play') // pause

// The loop must stop when no run is displayed: reset the scenario (displayedRun -> null).
const before = await flow()
const reset = (await page.$('.scenario-simple .btn.ghost')) ? '.scenario-simple .btn.ghost' : '.scenario-panel .btn'
await page.click(reset)
await page.waitForFunction(() => !document.querySelector('.cc .spinner'), null, { timeout: 60000 })
await page.waitForTimeout(400)
const a = await flow()
await page.waitForTimeout(1000)
const b = await flow()
console.log('after reset (displayedRun = null):', a, '→ 1 s later:', b, b.running === false && a.ticks === b.ticks ? 'LOOP STOPPED' : 'LOOP STILL RUNNING')
console.log('ticks while displayed:', before.ticks)
await browser.close()
if (f5 < 50) { console.log(`FAIL: ${f5.toFixed(1)} fps < 50`); process.exitCode = 1 }
if (!(b.running === false && a.ticks === b.ticks)) { console.log('FAIL: flow loop did not stop'); process.exitCode = 1 }
