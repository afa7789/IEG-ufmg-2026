// Modo slide da página "Sobre": hero + cada fieldset vira um slide. Setas/clique avançam, Esc sai.
// Liga com o botão ou abrindo about.html#slides.
const $ = (id) => document.getElementById(id)

export function initSlides() {
  const slides = [document.querySelector('.hero'), ...document.querySelectorAll('main fieldset')]
  let index = 0

  const show = (i) => {
    index = Math.max(0, Math.min(slides.length - 1, i))
    slides.forEach((s, n) => s.classList.toggle('slide-active', n === index))
    $('slideCounter').textContent = `${index + 1} / ${slides.length}`
  }
  const on = document.body.classList.contains('slides')
  const toggle = (enable) => {
    document.body.classList.toggle('slides', enable)
    $('slides').textContent = enable ? 'Sair do modo slide' : 'Modo slide'
    location.hash = enable ? 'slides' : ''
    if (enable) show(index)
  }

  const counter = Object.assign(document.createElement('div'), { id: 'slideCounter', className: 'slide-counter' })
  document.body.append(counter)
  $('slides').addEventListener('click', () => toggle(!document.body.classList.contains('slides')))

  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('slides')) return
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(index + 1) }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(index - 1) }
    if (e.key === 'Escape') toggle(false)
  })
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('slides')) return
    if (e.target.closest('button, a, video, pre, summary')) return
    show(index + 1)
  })

  window.addEventListener('hashchange', () => toggle(location.hash === '#slides'))
  if (on || location.hash === '#slides') toggle(true)
}
