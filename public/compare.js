// Comparação ElGamal-2048 vs ML-KEM-512/768/1024 medida no navegador (tamanhos, tempos) + estimativa de gas.
import { DL_GROUP } from './config.js'
import { el } from './dom.js'
import * as eg from './elgamal.js'
import * as pq from './pq.js'
import { $, log, on } from './ui.js'

const MESSAGE = 'x'.repeat(32)
const SECURITY = { 'ElGamal-2048': '~112 bits · 0 contra Shor', 'ML-KEM-512': 'NIST 1 (≈ AES-128)', 'ML-KEM-768': 'NIST 3 (≈ AES-192)', 'ML-KEM-1024': 'NIST 5 (≈ AES-256)' }

const bytes = (hex) => (hex.length - 2) / 2
const fmtMs = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`)
const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR')
const timed = (fn) => { const t = performance.now(); const v = fn(); return [v, performance.now() - t] }

// Gas aproximado: 21 000 base + 16/byte de calldata (+ 4 por byte zero, ignorado) + 20 000 por slot novo de 32 bytes
// + ~2 200 por palavra de overhead de ABI/length. Serve para ordem de grandeza; o teste mede o valor real em Anvil.
const gasFor = (payloadBytes) => 21000 + 16 * payloadBytes + 20000 * Math.ceil(payloadBytes / 32) + 2200 * 4

export function measure(name, keygen, encrypt, decrypt) {
  const [key, tk] = timed(keygen)
  const [c, te] = timed(() => encrypt(key, MESSAGE))
  const [back, td] = timed(() => decrypt(key, c.c1, c.c2))
  if (back !== MESSAGE) throw new Error(`${name}: round-trip falhou`)
  const pub = bytes(key.pub)
  const ct = bytes(c.c1) + bytes(c.c2)
  return { name, security: SECURITY[name], pub, priv: bytes(key.priv), ct, tk, te, td, gasRegister: gasFor(pub), gasSend: gasFor(ct + 20) }
}

export function measureAll() {
  const rows = [measure('ElGamal-2048', () => eg.keygen(DL_GROUP), eg.encrypt, eg.decrypt)]
  for (const mode of pq.MODES) rows.push(measure(mode, () => pq.keygen(mode), pq.encrypt, pq.decrypt))
  return rows
}

function render(rows) {
  const tbody = $('compareTable')
  tbody.replaceChildren()
  for (const r of rows) {
    tbody.append(el('tr', '', el('td', '', r.name), el('td', '', r.security), el('td', '', String(r.pub)), el('td', '', String(r.priv)), el('td', '', String(r.ct)),
      el('td', '', fmtMs(r.tk)), el('td', '', fmtMs(r.te)), el('td', '', fmtMs(r.td)), el('td', '', fmtInt(r.gasRegister)), el('td', '', fmtInt(r.gasSend))))
  }
}

if ($('compare')) {
  on('compare', () => { const rows = measureAll(); render(rows); window.__compare = rows; log(`Comparação: ${rows.length} esquemas medidos`) })
}
