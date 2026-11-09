// ElGamal clássico (Z_p*) via Botan compilado para WebAssembly. A ponte C está em wasm/bridge.c.
// Chaves em DER (hex). Chave pública on-chain = o próprio DER (SubjectPublicKeyInfo, carrega p, g, y).
import { M, byteLength, bytesToHex, check, deref, hexToBytes, takeBytes, takeString, withHeap } from './wasm-core.js'

const fn = {
  keygen: M.cwrap('eg_keygen', 'number', ['string', 'number', 'number', 'number', 'number']),
  fields: M.cwrap('eg_pub_fields', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  encrypt: M.cwrap('eg_encrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  decrypt: M.cwrap('eg_decrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
}

export { byteLength, bytesToHex, hexToBytes }

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

// ---- Parte 2: chaves fracas e ataque (log discreto). Usado pela página "Ataque" e pelo worker. ----

const weak = {
  keygen: M.cwrap('eg_keygen_weak', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
  decryptWithX: M.cwrap('eg_decrypt_with_x', 'number', ['number', 'number', 'string', 'number', 'number', 'number', 'number']),
  start: M.cwrap('dlp_start', 'number', ['string', 'string', 'string']),
  run: M.cwrap('dlp_run', 'number', ['number']),
  iters: M.cwrap('dlp_iters', 'number', []),
  lo: M.cwrap('dlp_result_lo', 'number', []),
  hi: M.cwrap('dlp_result_hi', 'number', []),
}

// Chave ElGamal com p de `bits` bits (8–64): insegura de propósito. Inclui x para conferir o ataque.
export function keygenWeak(bits) {
  return withHeap(({ slot }) => {
    const [priv, privLen, pub, pubLen, x] = [slot(), slot(), slot(), slot(), slot()]
    check(weak.keygen(bits, priv, privLen, pub, pubLen, x))
    const pubHex = bytesToHex(takeBytes(pub, pubLen))
    return { priv: bytesToHex(takeBytes(priv, privLen)), pub: pubHex, x: takeString(x), ...decodePubKey(pubHex) }
  })
}

// Decifra usando só a chave pública + o x recuperado: o Botan monta a privada a partir de (p, g, x).
export function decryptWithX(pubKey, xHex, c1, c2) {
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(pubKey.pub)
    const ct = new Uint8Array([...hexToBytes(c1), ...hexToBytes(c2)])
    const [pt, ptLen] = [slot(), slot()]
    check(weak.decryptWithX(push(der), der.length, xHex, push(ct), ct.length, pt, ptLen))
    return new TextDecoder().decode(takeBytes(pt, ptLen))
  })
}

// Pollard rho resumível: start, depois run(budget) até devolver true; x em hex, iters contadas.
export const solver = {
  start(pubKey) { check(weak.start(pubKey.p, pubKey.g, pubKey.y)) },
  run(budget) { const r = weak.run(budget); check(r < 0 ? r : 0); return r === 1 },
  iters() { return weak.iters() },
  x() { return `0x${((BigInt(weak.hi()) << 32n) | BigInt(weak.lo())).toString(16).toUpperCase()}` },
}
