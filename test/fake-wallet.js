// Carteira EIP-1193 fake injetada pelo teste: encaminha tudo para o Anvil (contas destravadas).
// window.__setAccount(n) troca a conta ativa e emite accountsChanged, como uma carteira real.
(() => {
  const RPC = 'http://127.0.0.1:8545'
  const listeners = {}
  let accounts = null
  let index = 0

  const rpc = async (method, params = []) => {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const json = await res.json()
    if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code })
    return json.result
  }
  const me = async () => { accounts ??= await rpc('eth_accounts'); return [accounts[index]] }
  const emit = (event, payload) => (listeners[event] ?? []).forEach((cb) => cb(payload))

  window.ethereum = {
    isMetaMask: true,
    on(event, cb) { (listeners[event] ??= []).push(cb) },
    removeListener() {},
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return me()
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
      if (method === 'eth_sendTransaction') { const [from] = await me(); return rpc(method, [{ ...params[0], from }]) }
      return rpc(method, params)
    },
  }
  window.__setAccount = async (n) => { index = n; emit('accountsChanged', await me()) }
})()
