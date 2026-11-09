// Teste ponta a ponta em Anvil: sobe anvil + servidor, roda o fluxo Alice → Bob → Alice num navegador
// headless com carteira fake e grava vídeo (.webm) + log (.log) em public/media/ para a página "Sobre".
//   npm test                      (requer: anvil no PATH, `npx playwright install chromium-headless-shell`)
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url)
const MEDIA = new URL('public/media/', ROOT)
const PAGE = 'http://localhost:8080/index.html'
const MSG = 'Oi Alice, o projeto de cripto ta pronto!'
const SLOW = Number(process.env.SLOW ?? 900)

const lines = []
const t0 = Date.now()
const log = (msg) => {
  const line = `[${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s] ${msg}`
  lines.push(line)
  console.log(line)
}
const fail = (msg) => { log(`✘ ${msg}`); throw new Error(msg) }
const assert = (cond, msg) => { if (!cond) fail(msg) }

function start(cmd, args, ready) {
  const child = spawn(cmd, args, { cwd: fileURLToPath(ROOT), stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    const probe = setInterval(() => fetch(ready).then(() => { clearInterval(probe); resolve(child) }).catch(() => {}), 200)
  })
}

async function run(page) {
  const text = (id) => page.locator(`#${id}`).innerText()
  const step = async (name) => { log(`✔ ${name}`); await page.waitForTimeout(SLOW) }

  await page.goto(PAGE)
  await page.waitForSelector('#injected option', { state: 'attached' })

  // Alice (conta #0)
  await page.click('#connect')
  await page.waitForSelector('#stepWallet[data-state="done"]')
  const aliceAddr = await page.evaluate(() => window.ethereum.request({ method: 'eth_accounts' }).then((a) => a[0]))
  await step(`Alice conectada: ${await text('walletState')}`)

  await page.click('#deploy')
  await page.waitForSelector('#stepContract[data-state="done"]')
  await step(`Deploy do MessageInbox em ${await page.inputValue('#contractAddr')}`)

  await page.click('#keygen')
  await page.waitForFunction(() => document.querySelector('#keyView').textContent.includes('y ='))
  await step(`Chave ElGamal gerada (Botan/wasm): ${(await text('keyView')).split('\n')[0]}`)

  await page.click('#register')
  await page.waitForSelector('#stepKey[data-state="done"]')
  await step('Chave pública registrada on-chain')

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')])
  const txt = readFileSync(await dl.path(), 'utf8')
  assert(/^priv: 0x[0-9a-f]+$/m.test(txt) && /^pub: 0x[0-9a-f]+$/m.test(txt), 'backup .txt sem priv/pub')
  await step(`Backup baixado: ${dl.suggestedFilename()}`)

  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elgamal.key.')).forEach((k) => localStorage.removeItem(k)))
  await page.reload()
  await page.waitForSelector('#injected option', { state: 'attached' })
  await page.click('#connect')
  await page.waitForSelector('#stepKey[data-state="current"]')
  assert((await text('keyView')).trim() === '', 'chave ainda presente após apagar o storage')
  await step('Storage apagado: chave sumiu')

  await page.setInputFiles('#importFile', await dl.path())
  await page.waitForSelector('#stepKey[data-state="done"]')
  await step('Chave importada do .txt e reconhecida como registrada')

  // Bob (conta #1)
  await page.evaluate(() => window.__setAccount(1))
  await page.waitForFunction((a) => !document.querySelector('#walletState').textContent.toLowerCase().startsWith(a), aliceAddr.slice(0, 8).toLowerCase())
  const bobAddr = await page.evaluate(() => window.ethereum.request({ method: 'eth_accounts' }).then((a) => a[0]))
  await step(`Troca para Bob: ${await text('walletState')}`)

  await page.click('#stepSend summary')
  await page.click('#scan')
  await page.waitForSelector('#directory tr')
  const listed = await page.locator('#directory tr:first-child td:nth-child(2)').innerText()
  assert(listed.toLowerCase() === aliceAddr.toLowerCase(), `diretório não listou Alice: ${listed}`)
  await page.click('#directory tr:first-child button')
  await step(`Diretório: ${await text('directoryState')}; "usar" preencheu o destinatário`)

  await page.fill('#alias', 'Alice')
  await page.click('#saveContact')
  await page.waitForFunction(() => document.querySelectorAll('#contacts option').length === 2)
  await step('Bob salvou Alice nos contatos')

  await page.fill('#message', MSG)
  await page.click('#send')
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('Enviada para'))
  await step(`Bob cifrou e enviou: ${(await text('sendView')).split('\n')[0].slice(0, 60)}…`)

  // Alice de novo (conta #0)
  await page.evaluate(() => window.__setAccount(0))
  await page.waitForFunction((a) => document.querySelector('#walletState').textContent.toLowerCase().startsWith(a), aliceAddr.slice(0, 8).toLowerCase())
  await step('Troca de volta para Alice')

  await page.fill('#to', bobAddr)
  await page.fill('#alias', 'Bob')
  await page.click('#saveContact')
  await page.waitForFunction(() => document.querySelectorAll('#contacts option').length === 3)
  await page.click('#refresh')
  await page.waitForSelector('#inbox tr')
  const from = await page.locator('#inbox tr:first-child td:nth-child(2)').innerText()
  assert(from.startsWith('Bob ('), `inbox não mostra apelido do remetente: ${from}`)
  await step(`Inbox: ${await text('inboxState')}, de "${from}"`)

  await page.click('#inbox tr:first-child button')
  await page.waitForFunction(() => !document.querySelector('#inbox tr:first-child td:last-child button'))
  const got = await page.locator('#inbox tr:first-child td:last-child').innerText()
  assert(got === MSG, `decifrado difere: "${got}"`)
  await step(`Alice decifrou: "${got}"`)
  await page.waitForTimeout(SLOW * 2)
}

const anvil = await start('anvil', ['--chain-id', '31337', '--silent'], 'http://127.0.0.1:8545')
const server = await start('node', ['server.js'], PAGE)
log('anvil (31337) e servidor (8080) no ar')

const videoDir = fileURLToPath(new URL('.video/', MEDIA))
rmSync(videoDir, { recursive: true, force: true })
mkdirSync(MEDIA, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } } })
const page = await ctx.newPage()
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`))
await page.addInitScript(readFileSync(new URL('fake-wallet.js', import.meta.url), 'utf8'))

let exit = 0
try {
  await run(page)
  log('RESULTADO: OK — fluxo Alice → Bob → Alice completo em Anvil')
} catch (e) {
  exit = 1
  log(`RESULTADO: FALHOU — ${e.message}`)
} finally {
  const video = page.video()
  await ctx.close()
  copyFileSync(await video.path(), new URL('demo-anvil.webm', MEDIA))
  rmSync(videoDir, { recursive: true, force: true })
  await browser.close()
  anvil.kill()
  server.kill()
  writeFileSync(new URL('demo-anvil.log', MEDIA), `${lines.join('\n')}\n`)
  log('gravado: public/media/demo-anvil.webm + demo-anvil.log')
}
process.exit(exit)
