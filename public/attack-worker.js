// Worker: roda o Pollard rho sem travar a página. Mensagens: {cmd:'solve', pubKey} → progress/done/error.
// O handler é instalado de forma síncrona e o wasm carrega por import() dinâmico: se o módulo fosse
// importado com top-level await, uma mensagem enviada durante o carregamento seria perdida.
const BUDGET = 1_000_000
const ready = import('./elgamal.js')

self.onmessage = async ({ data }) => {
  if (data.cmd !== 'solve') return
  try {
    const { solver } = await ready
    const t0 = performance.now()
    solver.start(data.pubKey)
    let lastPost = 0
    for (;;) {
      const found = solver.run(BUDGET)
      const now = performance.now()
      if (found) { self.postMessage({ type: 'done', x: solver.x(), iters: solver.iters(), ms: now - t0 }); return }
      if (now - lastPost > 250) { lastPost = now; self.postMessage({ type: 'progress', iters: solver.iters(), ms: now - t0 }) }
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message })
  }
}
