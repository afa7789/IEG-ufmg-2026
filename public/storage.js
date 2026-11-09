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

export const contractKey = (chainId) => `elgamal.contract.${chainId}`
export const keyKey = (chainId, address) => `elgamal.key.${chainId}.${address.toLowerCase()}`

export const loadContract = (chainId) => read(contractKey(chainId))
export const saveContract = (chainId, address) => write(contractKey(chainId), address)

export const loadKey = (chainId, address) => read(keyKey(chainId, address))
export const saveKey = (chainId, address, key) => write(keyKey(chainId, address), key)
