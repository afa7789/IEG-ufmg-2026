import { el } from './dom.js'
import { byteLength, decryptWithX, encrypt, keygenWeak } from './elgamal.js'
import { fmtYears, projectYears } from './attack-math.js'
import { $, log, on, renderHeader, short } from './ui.js'

const BITS = [16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64]
const state = { key: null, cipher: null, message: null, worker: null, results: [] }

const fmtMs = (ms) => (ms < 1000 ? `${ms.toFixed(0)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 60000).toFixed(1)} min`)
const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR')
const bitsOf = (hex) => BigInt(hex).toString(2).length

// ---- passo 1 ----

function makeWeak() {
  const bits = Number($('bits').value)
  const message = $('message').value
  if (!message) throw new Error('Mensagem vazia')
  const key = keygenWeak(bits)
  if (byteLength(message) > key.pBytes - 1) throw new Error(`Mensagem longa demais para p de ${bits} bits: máximo ${key.pBytes - 1} byte(s)`)
  state.key = key
  state.message = message
  state.cipher = encrypt(key, message)
  state.breakResult = null
  $('keyView').textContent = `p = ${key.p} (${bits} bits)\ng = ${key.g}\ny = ${key.y}\nx = (secreto; revelado após o ataque)\nc1 = ${state.cipher.c1}\nc2 = ${state.cipher.c2}`
  $('breakView').textContent = ''
  $('progress').textContent = ''
  log(`Chave fraca de ${bits} bits gerada pelo Botan; "${message}" cifrada`)
}

// ---- passo 2 ----

function solve(pubKey, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./attack-worker.js', { type: 'module' })
    state.worker = worker
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data)
      if (data.type === 'done') { worker.terminate(); state.worker = null; resolve(data) }
      if (data.type === 'error') { worker.terminate(); state.worker = null; reject(new Error(data.message)) }
    }
    worker.onerror = (e) => { worker.terminate(); state.worker = null; reject(new Error(e.message)) }
    worker.postMessage({ cmd: 'solve', pubKey: { p: pubKey.p, g: pubKey.g, y: pubKey.y } })
  })
}

function stopSolve() {
  state.worker?.terminate()
  state.worker = null
  $('progress').textContent = 'Parado.'
}

const progressText = (bits, d) => `${bits} bits · ${fmtInt(d.iters)} iterações · ${fmtMs(d.ms)} · ${fmtInt(d.iters / (d.ms / 1000))} it/s`

async function attack(key, cipher, message) {
  const bits = bitsOf(key.p)
  $('stop').disabled = false
  try {
    const r = await solve(key, (d) => { $('progress').textContent = progressText(bits, d) })
    const xOk = BigInt(r.x) === BigInt(key.x)
    const decrypted = decryptWithX(key, r.x, cipher.c1, cipher.c2)
    $('progress').textContent = progressText(bits, r)
    return { bits, p: key.p, iters: r.iters, ms: r.ms, x: r.x, xOk, decrypted, ok: xOk && decrypted === message }
  } finally {
    $('stop').disabled = true
  }
}

async function doBreak() {
  if (!state.key) throw new Error('Gere uma chave fraca primeiro')
  const r = await attack(state.key, state.cipher, state.message)
  $('breakView').textContent = `x recuperado = ${r.x}\nx real       = ${state.key.x}\n${r.xOk ? '✓ iguais' : '✗ diferentes'}\n\nDecifrado com o x recuperado (via Botan): "${r.decrypted}"`
  log(`Quebrado em ${fmtMs(r.ms)} com ${fmtInt(r.iters)} iterações`)
}

// ---- passo 3 ----

function renderResults() {
  const tbody = $('results')
  tbody.replaceChildren()
  for (const r of state.results) {
    tbody.append(el('tr', '', el('td', '', String(r.bits)), el('td', '', short(r.p, 6)), el('td', '', fmtInt(r.iters)), el('td', '', fmtMs(r.ms)),
      el('td', '', fmtInt(r.iters / (r.ms / 1000))), el('td', '', r.xOk ? '✓' : '✗'), el('td', '', `"${r.decrypted}"`)))
  }
  $('extrapolation').textContent = extrapolate()
}

function extrapolate() {
  const last = state.results.at(-1)
  if (!last) return ''
  const rate = last.iters / (last.ms / 1000)
  const at = (bits) => fmtYears(projectYears(bits, rate))
  return `A ${fmtInt(rate)} it/s: 80 bits ≈ ${at(80)} · 128 bits ≈ ${at(128)} · 2048 bits (chave do app) ≈ ${at(2048)}. ` +
    'Rho é exponencial; o melhor ataque conhecido para Z_p* (NFS) é subexponencial, mas 2048 bits continua inviável.'
}

async function runBench() {
  const from = Number($('benchFrom').value)
  const to = Number($('benchTo').value)
  if (from > to) throw new Error('"De" maior que "Até"')
  state.results = []
  for (const bits of BITS.filter((b) => b >= from && b <= to)) {
    const key = keygenWeak(bits)
    const message = bits >= 24 ? 'oi' : 'o'
    const cipher = encrypt(key, message)
    log(`Benchmark ${bits} bits…`)
    const r = await attack(key, cipher, message)
    state.results.push(r)
    renderResults()
    log(`${bits} bits: ${fmtMs(r.ms)}, ${fmtInt(r.iters)} it, x ${r.xOk ? 'ok' : 'ERRADO'}`)
  }
}

async function copyBench() {
  if (!state.results.length) throw new Error('Nada para copiar')
  await navigator.clipboard.writeText(JSON.stringify(state.results, null, 2))
  log('JSON copiado')
}

// ---- init ----

function fillBits(id, selected) {
  for (const b of BITS) $(id).append(Object.assign(el('option', '', String(b)), { value: String(b) }))
  $(id).value = String(selected)
}

function init() {
  renderHeader('attack.html')
  fillBits('bits', 32)
  fillBits('benchFrom', 16)
  fillBits('benchTo', 48)
  on('weak', makeWeak)
  on('break', doBreak)
  on('bench', runBench)
  on('benchCopy', copyBench)
  $('stop').addEventListener('click', stopSolve)
}

init()
window.__attack = { state, runBench, attackSizes: BITS }
