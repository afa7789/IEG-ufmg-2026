// Esquema pós-quântico: ML-KEM (FIPS 203) + HKDF + AES-256/GCM. Sem log discreto para o Shor atacar.
import { MODES, decrypt, encrypt, keygen } from './pq.js'

export { MODES }
export const id = 'mlkem'
export const label = 'ML-KEM + AES-GCM'
export const maxMessageBytes = 1000
export let mode = 'ML-KEM-768'
export const setMode = (m) => { mode = m }

export const generate = () => keygen(mode)
export const encodePubKey = (key) => key.pub
export const decodePubKey = (bytes) => ({ pub: bytes })
export { decrypt, encrypt }
export const describeKeygen = () => `Gerando par ${mode}…`
export const limitFor = () => maxMessageBytes

export function keyText(k) {
  return `${k.mode}\nDER pública = ${(k.pub.length - 2) / 2} bytes (vai on-chain) · DER privada = ${(k.priv.length - 2) / 2} bytes (localStorage)\nMensagem: ML-KEM encapsula um segredo → HKDF → AES-256/GCM. c1 = encapsulado, c2 = nonce‖ciphertext‖tag`
}
