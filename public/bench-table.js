// Tabela do benchmark do ataque na página "Sobre", a partir de media/bench-dlp.json.
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
