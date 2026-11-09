import { getAddress, toHex } from 'https://esm.sh/viem@2.21.55'

// EIP-6963 discovery, com fallback para window.ethereum.
export function discoverInjected(timeout = 400) {
  return new Promise((resolve) => {
    const found = new Map()
    const onAnnounce = (e) => found.set(e.detail.info.uuid, e.detail)
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      const list = [...found.values()]
      if (!list.length && window.ethereum) list.push({ info: { uuid: 'legacy', name: 'window.ethereum' }, provider: window.ethereum })
      resolve(list)
    }, timeout)
  })
}

export async function connect(provider) {
  const [account] = await provider.request({ method: 'eth_requestAccounts' })
  const chainId = Number(await provider.request({ method: 'eth_chainId' }))
  return { address: getAddress(account), chainId }
}

export function addChain(provider, chain) {
  return provider.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: toHex(chain.id),
      chainName: chain.name,
      rpcUrls: [chain.rpc],
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      blockExplorerUrls: chain.explorer ? [chain.explorer] : undefined,
    }],
  })
}

// 4902 = carteira não conhece a rede: adiciona e tenta de novo.
export async function switchChain(provider, chain) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHex(chain.id) }] })
  } catch (e) {
    if (e.code !== 4902) throw e
    await addChain(provider, chain)
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHex(chain.id) }] })
  }
}
