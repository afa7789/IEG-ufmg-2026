// Tabelas da página "Sobre": benchmark do ataque (media/bench-dlp.json) e comparação de esquemas (media/compare.json).
import { el } from './dom.js'
import { fmtYears, projectYears } from './attack-math.js'

const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR')
const fmtMs = (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60000).toFixed(1)} min`)

export async function renderBench(tableId, summaryId) {
  const res = await fetch('media/bench-dlp.json')
  if (!res.ok) { document.getElementById(summaryId).textContent = 'benchmark indisponível'; return }
  const { date, results } = await res.json()
  const tbody = document.getElementById(tableId)
  for (const r of results) {
    tbody.append(el('tr', '', el('td', '', String(r.bits)), el('td', '', fmtInt(r.iters)), el('td', '', fmtMs(r.ms)), el('td', '', fmtInt(r.rate)), el('td', '', r.xOk ? '✓' : '✗')))
  }
  const last = results.at(-1)
  const at = (bits) => fmtYears(projectYears(bits, last.rate))
  document.getElementById(summaryId).textContent =
    `${new Date(date).toLocaleDateString('pt-BR')} · maior chave quebrada: ${last.bits} bits em ${fmtMs(last.ms)}. ` +
    `Projeção a ${fmtInt(last.rate)} it/s: 80 bits ≈ ${at(80)} · 128 bits ≈ ${at(128)} · 2048 bits ≈ ${at(2048)}.`
}

const fmtShort = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`)

export async function renderCompare(tableId, summaryId) {
  const res = await fetch('media/compare.json')
  if (!res.ok) { document.getElementById(summaryId).textContent = 'comparação indisponível'; return }
  const { date, results } = await res.json()
  const tbody = document.getElementById(tableId)
  for (const r of results) {
    tbody.append(el('tr', '', el('td', '', r.name), el('td', '', r.security), el('td', '', String(r.pub)), el('td', '', String(r.ct)),
      el('td', '', fmtShort(r.tk)), el('td', '', fmtShort(r.te)), el('td', '', fmtShort(r.td)), el('td', '', fmtInt(r.gasRegisterReal)), el('td', '', fmtInt(r.gasSendReal))))
  }
  const eg = results.find((r) => r.name.startsWith('ElGamal'))
  const pq = results.find((r) => r.name === 'ML-KEM-768')
  if (eg && pq) document.getElementById(summaryId).textContent = `${new Date(date).toLocaleDateString('pt-BR')} · ML-KEM-768 vs ElGamal-2048: registro ${(pq.gasRegisterReal / eg.gasRegisterReal).toFixed(2)}×, envio ${(pq.gasSendReal / eg.gasSendReal).toFixed(2)}× o gas; cifrar ${(eg.te / pq.te).toFixed(0)}× mais rápido.`
}
