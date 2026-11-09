// Benchmark do ataque (Pollard rho) em navegador headless: 16 → 64 bits, um tamanho por vez.
// Grava public/media/bench-dlp.json + bench-dlp.log, exibidos na página "Sobre".
//   npm run bench   (requer `npx playwright install chromium-headless-shell`; ~2 min, 64 bits domina)
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url)
const MEDIA = new URL('public/media/', ROOT)
const PAGE = 'http://localhost:8080/attack.html'
const FROM = Number(process.env.BENCH_FROM ?? 16)
const TO = Number(process.env.BENCH_TO ?? 64)

const lines = []
const t0 = Date.now()
const log = (msg) => {
  const line = `[${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s] ${msg}`
  lines.push(line)
  console.log(line)
}

const server = spawn('node', ['server.js'], { cwd: fileURLToPath(ROOT), stdio: 'ignore' })
await new Promise((resolve) => { const probe = setInterval(() => fetch(PAGE).then(() => { clearInterval(probe); resolve() }).catch(() => {}), 200) })

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`))
await page.goto(PAGE)
await page.waitForSelector('#bits option', { state: 'attached' })
const sizes = (await page.evaluate(() => window.__attack.attackSizes)).filter((b) => b >= FROM && b <= TO)
log(`Pollard rho em wasm, tamanhos: ${sizes.join(', ')} bits`)

let exit = 0
const results = []
try {
  for (const bits of sizes) {
    await page.selectOption('#benchFrom', String(bits))
    await page.selectOption('#benchTo', String(bits))
    await page.click('#bench')
    await page.waitForFunction(() => document.querySelectorAll('#results tr').length === 1 && !document.querySelector('#bench').hasAttribute('aria-busy'), null, { timeout: 30 * 60 * 1000 })
    const err = await page.locator('#stepBench .error').innerText()
    if (err) throw new Error(`${bits} bits: ${err}`)
    const r = (await page.evaluate(() => window.__attack.state.results))[0]
    results.push({ bits: r.bits, p: r.p, iters: r.iters, ms: Math.round(r.ms), rate: Math.round(r.iters / (r.ms / 1000)), xOk: r.xOk, decrypted: r.decrypted })
    log(`${String(bits).padStart(2)} bits · p=${r.p} · ${r.iters.toLocaleString('pt-BR')} it · ${(r.ms / 1000).toFixed(3)} s · ${Math.round(r.iters / (r.ms / 1000)).toLocaleString('pt-BR')} it/s · x ${r.xOk ? 'ok' : 'ERRADO'} · "${r.decrypted}"`)
  }
  const last = results.at(-1)
  const extrapolation = await page.evaluate(() => document.querySelector('#extrapolation').textContent)
  log(`Taxa no maior tamanho: ${last.rate.toLocaleString('pt-BR')} it/s. ${extrapolation}`)
  log('RESULTADO: OK')
} catch (e) {
  exit = 1
  log(`RESULTADO: FALHOU — ${e.message}`)
} finally {
  await browser.close()
  server.kill()
  const ua = 'Chromium headless (Playwright), wasm single-thread'
  writeFileSync(new URL('bench-dlp.json', MEDIA), `${JSON.stringify({ date: new Date().toISOString(), environment: ua, results }, null, 2)}\n`)
  writeFileSync(new URL('bench-dlp.log', MEDIA), `${lines.join('\n')}\n`)
  log('gravado: public/media/bench-dlp.json + bench-dlp.log')
}
process.exit(exit)
