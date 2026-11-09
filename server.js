// Zero-dependency static server for public/. CORS is open because Safe{Wallet}
// fetches manifest.json cross-origin when the page is added as a Safe App.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./public', import.meta.url))
const port = Number(process.env.PORT ?? 8080)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

createServer(async (req, res) => {
  // normalize() of an absolute path cannot climb above "/", so files stay under root.
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
  const file = join(root, path === '/' ? 'index.html' : path)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
