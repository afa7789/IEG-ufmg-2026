// Esquema clássico: ElGamal textbook sobre Z_p* (modp/ietf/2048). Vulnerável a Shor.
import { DL_GROUP } from './config.js'
import { decodePubKey, decrypt, encodePubKey, encrypt, keygen, maxBytes } from './elgamal.js'
import { short } from './ui.js'

export const id = 'elgamal'
export const label = 'ElGamal 2048'
export const maxMessageBytes = 200

export const generate = () => keygen(DL_GROUP)
export { decodePubKey, decrypt, encodePubKey, encrypt }
export const describeKeygen = () => `Gerando chave ElGamal no grupo ${DL_GROUP}…`
export const limitFor = (pub) => maxBytes(pub)

export function keyText(k) {
  return `p = ${short(k.p)} (${k.pBytes * 8} bits)\ng = ${k.g}\ny = ${short(k.y)}\nDER pública = ${(k.pub.length - 2) / 2} bytes (vai on-chain) · DER privada = ${(k.priv.length - 2) / 2} bytes (localStorage)`
}
