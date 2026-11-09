// ElGamal textbook sobre Z_p* via biblioteca pronta (jsbn por baixo). Nada de aritmética modular manual aqui.
import { Buffer } from 'https://esm.sh/node/buffer.mjs'
import * as lib from 'https://esm.sh/elgamal@0.3.0?bundle'
import { decodeAbiParameters, encodeAbiParameters } from 'https://esm.sh/viem@2.21.55'

// O polyfill de crypto.randomBytes usado pela lib espera um Buffer global, como no Node.
globalThis.Buffer ??= Buffer

const ElGamal = lib.default.default ?? lib.default
const { EncryptedValue, BigInt: JsBigInt } = lib

const PUBKEY_ABI = [{ type: 'bytes' }, { type: 'bytes' }, { type: 'bytes' }]

const evenHex = (hex) => (hex.length % 2 ? `0${hex}` : hex)
export const biToHex = (bi) => `0x${evenHex(bi.toString(16))}`
export const hexToBi = (hex) => new JsBigInt(hex.slice(2), 16)

const utf8ToBi = (text) => {
  const bytes = new TextEncoder().encode(text)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return new JsBigInt(hex, 16)
}

const biToUtf8 = (bi) => {
  const hex = evenHex(bi.toString(16))
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16))
  return new TextDecoder().decode(bytes)
}

export const byteLength = (text) => new TextEncoder().encode(text).length

// Chave serializada em hex para caber no localStorage: { p, g, y, x }.
export async function keygen(bits) {
  const k = await ElGamal.generateAsync(bits)
  return { p: biToHex(k.p), g: biToHex(k.g), y: biToHex(k.y), x: biToHex(k.x) }
}

export const encodePubKey = ({ p, g, y }) => encodeAbiParameters(PUBKEY_ABI, [p, g, y])

export function decodePubKey(bytes) {
  const [p, g, y] = decodeAbiParameters(PUBKEY_ABI, bytes)
  return { p, g, y }
}

// Limite de mensagem: m < p. Reservamos um byte para evitar m >= p.
export const maxBytes = (pubKey) => Math.floor((pubKey.p.length - 2) / 2) - 1

export async function encrypt(pubKey, text) {
  const limit = maxBytes(pubKey)
  if (byteLength(text) > limit) throw new Error(`Mensagem longa demais: máximo ${limit} bytes para esta chave`)
  const eg = new ElGamal(hexToBi(pubKey.p), hexToBi(pubKey.g), hexToBi(pubKey.y), null)
  const c = await eg.encryptAsync(utf8ToBi(text))
  return { c1: biToHex(c.a), c2: biToHex(c.b) }
}

export async function decrypt(key, c1, c2) {
  const eg = new ElGamal(hexToBi(key.p), hexToBi(key.g), hexToBi(key.y), hexToBi(key.x))
  const m = await eg.decryptAsync(new EncryptedValue(hexToBi(c1), hexToBi(c2)))
  return biToUtf8(m.bi)
}
