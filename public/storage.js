// localStorage com try/catch: modo privado ou storage bloqueado não pode quebrar a página.
function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch { /* storage indisponível: vale só nesta visita */ }
}

// Chaves e contratos são por esquema ('elgamal' | 'mlkem'): o prefixo 'elgamal.' é mantido por compatibilidade.
export const contractKey = (scheme, chainId) => `${scheme}.contract.${chainId}`
export const keyKey = (scheme, chainId, address) => `${scheme}.key.${chainId}.${address.toLowerCase()}`

export const loadContract = (scheme, chainId) => read(contractKey(scheme, chainId))
export const saveContract = (scheme, chainId, address) => write(contractKey(scheme, chainId), address)

export const loadKey = (scheme, chainId, address) => read(keyKey(scheme, chainId, address))
export const saveKey = (scheme, chainId, address, key) => write(keyKey(scheme, chainId, address), key)

// Contatos (apelido → endereço) valem para todas as redes: o endereço é o mesmo.
const CONTACTS = 'elgamal.contacts'
export const loadContacts = () => read(CONTACTS) ?? []
export const saveContacts = (list) => write(CONTACTS, list)
