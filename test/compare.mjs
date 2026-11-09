// Comparação ElGamal-2048 vs ML-KEM em Anvil: tamanhos e tempos medidos no navegador (compare.js)
// + gas REAL de registerPublicKey e sendMessage (receipts). Grava public/media/compare.json + .log.
//   npm run compare
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createPublicClient, createWalletClient, http } from 'viem'
import { foundry } from 'viem/chains'

const ROOT = new URL('..', import.meta.url)
const MEDIA = new URL('public/media/', ROOT)
const PAGE = 'http://localhost:8080/pq.html'
const artifact = JSON.parse(readFileSync(new URL('public/contract/MessageInbox.json', ROOT), 'utf8'))

const lines = []
const log = (msg) => { lines.push(msg); console.log(msg) }

function start(cmd, args, ready) {
  const child = spawn(cmd, args, { cwd: fileURLToPath(ROOT), stdio: 'ignore' })
  return new Promise((resolve) => { const probe = setInterval(() => fetch(ready).then(() => { clearInterval(probe); resolve(child) }).catch(() => {}), 200) })
}

const anvil = await start('anvil', ['--chain-id', '31337', '--silent'], 'http://127.0.0.1:8545')
const server = await start('node', ['server.js'], PAGE)

const transport = http('http://127.0.0.1:8545')
const pub = createPublicClient({ chain: foundry, transport })
// Uma conta por esquema: registrar duas vezes na mesma conta reescreve slots (2 900 gas) em vez de criar (20 000).
const accounts = await pub.request({ method: 'eth_accounts' })
const walletFor = (i) => createWalletClient({ chain: foundry, transport, account: accounts[i] })
const send = async (fn) => pub.waitForTransactionReceipt({ hash: await fn() })

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`))
await page.goto(PAGE)
await page.waitForSelector('#injected option', { state: 'attached' })

let exit = 0
const results = []
try {
  const hash = await walletFor(0).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode })
  const { contractAddress } = await pub.waitForTransactionReceipt({ hash })
  log(`MessageInbox em ${contractAddress} (Anvil)`)

  // Tamanhos/tempos vêm da própria página; as chaves e ciphertexts brutos também, para as transações reais.
  const samples = await page.evaluate(async () => {
    const { measureAll } = await import('./compare.js')
    const eg = await import('./elgamal.js')
    const pq = await import('./pq.js')
    const { DL_GROUP } = await import('./config.js')
    const rows = measureAll()
    const raw = {}
    const k = eg.keygen(DL_GROUP); raw['ElGamal-2048'] = { pub: k.pub, ...eg.encrypt(k, 'x'.repeat(32)) }
    for (const m of pq.MODES) { const kk = pq.keygen(m); raw[m] = { pub: kk.pub, ...pq.encrypt(kk, 'x'.repeat(32)) } }
    return { rows, raw }
  })

  for (const [i, row] of samples.rows.entries()) {
    const { pub: pubKey, c1, c2 } = samples.raw[row.name]
    const wallet = walletFor(i + 1)
    const reg = await send(() => wallet.writeContract({ address: contractAddress, abi: artifact.abi, functionName: 'registerPublicKey', args: [pubKey] }))
    const snd = await send(() => wallet.writeContract({ address: contractAddress, abi: artifact.abi, functionName: 'sendMessage', args: [accounts[i + 1], c1, c2] }))
    const r = { ...row, gasRegisterReal: Number(reg.gasUsed), gasSendReal: Number(snd.gasUsed) }
    results.push(r)
    log(`${r.name.padEnd(13)} pub ${String(r.pub).padStart(5)} B · ct ${String(r.ct).padStart(5)} B · keygen ${r.tk.toFixed(1)} ms · enc ${r.te.toFixed(1)} ms · dec ${r.td.toFixed(1)} ms · gas registro ${r.gasRegisterReal.toLocaleString('pt-BR')} (est. ${r.gasRegister.toLocaleString('pt-BR')}) · gas envio ${r.gasSendReal.toLocaleString('pt-BR')} (est. ${r.gasSend.toLocaleString('pt-BR')})`)
  }
  log('RESULTADO: OK')
} catch (e) {
  exit = 1
  log(`RESULTADO: FALHOU — ${e.message}`)
} finally {
  await browser.close()
  anvil.kill()
  server.kill()
  writeFileSync(new URL('compare.json', MEDIA), `${JSON.stringify({ date: new Date().toISOString(), message: '32 bytes', results }, null, 2)}\n`)
  writeFileSync(new URL('compare.log', MEDIA), `${lines.join('\n')}\n`)
  log('gravado: public/media/compare.json + compare.log')
}
process.exit(exit)
