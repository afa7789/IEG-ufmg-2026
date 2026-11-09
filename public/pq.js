// ML-KEM (FIPS 203) + HKDF + AES-256/GCM via Botan em WebAssembly. Ponte em wasm/bridge_pq.c.
// Chaves em DER (hex). Chave pública on-chain = DER SubjectPublicKeyInfo. c1 = encapsulado, c2 = nonce||AEAD.
import { M, byteLength, bytesToHex, check, hexToBytes, takeBytes, withHeap } from './wasm-core.js'

const fn = {
  keygen: M.cwrap('pq_keygen', 'number', ['string', 'number', 'number', 'number', 'number']),
  encrypt: M.cwrap('pq_encrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
  decrypt: M.cwrap('pq_decrypt', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
}

export const MODES = ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']
export { byteLength }

export function keygen(mode = 'ML-KEM-768') {
  return withHeap(({ slot }) => {
    const [priv, privLen, pub, pubLen] = [slot(), slot(), slot(), slot()]
    check(fn.keygen(mode, priv, privLen, pub, pubLen))
    return { mode, priv: bytesToHex(takeBytes(priv, privLen)), pub: bytesToHex(takeBytes(pub, pubLen)) }
  })
}

export function encrypt(pubKey, text) {
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(pubKey.pub)
    const msg = new TextEncoder().encode(text)
    const [c1, c1Len, c2, c2Len] = [slot(), slot(), slot(), slot()]
    check(fn.encrypt(push(der), der.length, push(msg), msg.length, c1, c1Len, c2, c2Len))
    return { c1: bytesToHex(takeBytes(c1, c1Len)), c2: bytesToHex(takeBytes(c2, c2Len)) }
  })
}

export function decrypt(key, c1, c2) {
  return withHeap(({ push, slot }) => {
    const der = hexToBytes(key.priv)
    const a = hexToBytes(c1)
    const b = hexToBytes(c2)
    const [pt, ptLen] = [slot(), slot()]
    check(fn.decrypt(push(der), der.length, push(a), a.length, push(b), b.length, pt, ptLen))
    return new TextDecoder().decode(takeBytes(pt, ptLen))
  })
}
