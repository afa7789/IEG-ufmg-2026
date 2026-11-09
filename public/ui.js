// Pedaços compartilhados pelas três páginas: header, tema, log e o wrapper de ação com feedback.
import { el } from './dom.js'
import { REPO } from './config.js'

export const $ = (id) => document.getElementById(id)

const PAGES = [['index.html', 'App'], ['attack.html', 'Ataque'], ['pq.html', 'Pós-quântico'], ['admin.html', 'Rede local'], ['about.html', 'Sobre']]

export function renderHeader(active) {
  const header = document.querySelector('header')
  header.append(el('a', 'logo', 'ElGamal Inbox'))
  header.lastChild.href = 'index.html'
  for (const [href, label] of PAGES) {
    const a = el('a', href === active ? 'active' : '', label)
    a.href = href
    header.append(a)
  }
  const badge = el('span', 'badge', 'desconectado')
  badge.id = 'walletBadge'
  header.append(badge)
  const repo = el('a', '', '→ repo')
  repo.href = REPO
  header.append(repo)
}

export const log = (msg) => {
  const pre = $('log')
  if (pre) pre.textContent = `${new Date().toLocaleTimeString()} ${msg}\n${pre.textContent}`
}

export const short = (hex, n = 10) => (hex && hex.length > 2 * n + 2 ? `${hex.slice(0, n + 2)}…${hex.slice(-n)}` : hex)

// Toda ação: botão fica busy, erro cai dentro do próprio fieldset, e `after` re-renderiza.
export function on(id, fn, after = () => {}) {
  const btn = $(id)
  const error = btn.closest('fieldset')?.querySelector('.error')
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-busy', 'true')
    if (error) error.textContent = ''
    try {
      await fn()
    } catch (e) {
      log(`ERRO ${e.shortMessage ?? e.message}`)
      if (error) error.textContent = `✕ ${e.shortMessage ?? e.message}`
    } finally {
      btn.removeAttribute('aria-busy')
      after()
    }
  })
}

export function copyButton(text) {
  const b = el('button', 'secondary small', 'copiar')
  b.addEventListener('click', async () => {
    await navigator.clipboard.writeText(text)
    b.textContent = 'copiado ✓'
    setTimeout(() => { b.textContent = 'copiar' }, 1500)
  })
  return b
}
