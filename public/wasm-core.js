// Núcleo do WebAssembly (Botan): instancia o módulo e expõe helpers de heap/hex para os esquemas.
import createModule from './wasm/botan-elgamal.js'

export const M = await createModule()
const lastError = M.cwrap('eg_last_error', 'string', [])

const PTR = 4

export const bytesToHex = (bytes) => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
export const hexToBytes = (hex) => Uint8Array.from(hex.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16))
export const byteLength = (text) => new TextEncoder().encode(text).length

// Buffer de entrada no heap wasm; `out` são slots (ponteiro + tamanho) preenchidos pelo C.
export function withHeap(run) {
  const allocs = []
  const push = (bytes) => {
    const ptr = M._malloc(bytes.length || 1)
    M.HEAPU8.set(bytes, ptr)
    allocs.push(ptr)
    return ptr
  }
  const slot = () => { const p = M._malloc(PTR); M.HEAPU8.fill(0, p, p + PTR); allocs.push(p); return p }
  try { return run({ push, slot }) } finally { allocs.forEach((p) => M._free(p)) }
}

export const deref = (slot) => M.getValue(slot, 'i32')

// Lê (ptr, len) escritos pelo C, copia para o JS e libera no heap.
export function takeBytes(ptrSlot, lenSlot) {
  const ptr = deref(ptrSlot)
  const len = deref(lenSlot)
  const out = M.HEAPU8.slice(ptr, ptr + len)
  M._eg_free(ptr)
  return out
}

export function takeString(ptrSlot) {
  const ptr = deref(ptrSlot)
  const s = M.UTF8ToString(ptr)
  M._eg_free(ptr)
  return s
}

export const check = (rc) => { if (rc !== 0) throw new Error(`Botan: ${lastError() || `erro ${rc}`}`) }
