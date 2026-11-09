// ElGamal clássico (Z_p*) via Botan compilado para WebAssembly. A ponte C está em wasm/bridge.c.
// Chaves em DER (hex). Chave pública on-chain = o próprio DER (SubjectPublicKeyInfo, carrega p, g, y).
import createModule from './wasm/botan-elgamal.js'

const M = await createModule()
const fn = {
  keygen: M.cwrap('eg_keygen', 'number', ['string', 'number', 'number', 'number', 'number']),
  fields: M.cwrap('eg_pub_fields', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  encrypt: M.cwrap('eg_encrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  decrypt: M.cwrap('eg_decrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  lastError: M.cwrap('eg_last_error', 'string', []),
}

const PTR = 4

export const bytesToHex = (bytes) => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
export const hexToBytes = (hex) => Uint8Array.from(hex.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16))
export const byteLength = (text) => new TextEncoder().encode(text).length

// Buffer de entrada no heap wasm; `out` são slots (ponteiro + tamanho) preenchidos pelo C.
function withHeap(run) {
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

const deref = (slot) => M.getValue(slot, 'i32')

// Lê (ptr, len) escritos pelo C, copia para o JS e libera no heap.
function takeBytes(ptrSlot, lenSlot) {
  const ptr = deref(ptrSlot)
  const len = deref(lenSlot)
  const out = M.HEAPU8.slice(ptr, ptr + len)
  M._eg_free(ptr)
  return out
}

function takeString(ptrSlot) {
  const ptr = deref(ptrSlot)
  const s = M.UTF8ToString(ptr)
  M._eg_free(ptr)
  return s
}

const check = (rc) => { if (rc !== 0) throw new Error(`Botan: ${fn.lastError() || `erro ${rc}`}`) }

// Chave serializada: { priv, pub } em hex DER + campos legíveis.
export function keygen(group) {
  return withHeap(({ slot }) => {
    const [priv, privLen, pub, pubLen] = [slot(), slot(), slot(), slot()]
    check(fn.keygen(group, priv, privLen, pub, pubLen))
    const pubHex = bytesToHex(takeBytes(pub, pubLen))
    return { priv: bytesToHex(takeBytes(priv, privLen)), pub: pubHex, ...decodePubKey(pubHex) }
  })
}

export function decodePubKey(pubHex) {
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(pubHex)
    const [p, g, y, pBytes] = [slot(), slot(), slot(), slot()]
    check(fn.fields(push(der), der.length, p, g, y, pBytes))
    return { pub: pubHex, p: takeString(p), g: takeString(g), y: takeString(y), pBytes: deref(pBytes) }
  })
}

export const encodePubKey = (key) => key.pub

// Padding "Raw": m < p. Reservamos um byte.
export const maxBytes = (pubKey) => pubKey.pBytes - 1

export function encrypt(pubKey, text) {
  const limit = maxBytes(pubKey)
  if (byteLength(text) > limit) throw new Error(`Mensagem longa demais: máximo ${limit} bytes para esta chave`)
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(pubKey.pub)
    const msg = new TextEncoder().encode(text)
    const [ct, ctLen] = [slot(), slot()]
    check(fn.encrypt(push(der), der.length, push(msg), msg.length, ct, ctLen))
    const bytes = takeBytes(ct, ctLen)
    const half = bytes.length / 2
    return { c1: bytesToHex(bytes.subarray(0, half)), c2: bytesToHex(bytes.subarray(half)) }
  })
}

export function decrypt(key, c1, c2) {
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(key.priv)
    const ct = new Uint8Array([...hexToBytes(c1), ...hexToBytes(c2)])
    const [pt, ptLen] = [slot(), slot()]
    check(fn.decrypt(push(der), der.length, push(ct), ct.length, pt, ptLen))
    return new TextDecoder().decode(takeBytes(pt, ptLen))
  })
}
