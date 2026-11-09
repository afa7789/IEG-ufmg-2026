import { createPublicClient, createWalletClient, custom, defineChain } from 'https://esm.sh/viem@2.21.55'

const artifact = await fetch(new URL('./contract/MessageInbox.json', import.meta.url)).then((r) => r.json())
export const ABI = artifact.abi

const toViemChain = (chain) => defineChain({
  id: chain.id,
  name: chain.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [chain.rpc] } },
})

// Leituras e escritas passam pela carteira: funciona em https (Pages) mesmo com RPC http local.
export function clients(provider, chain, account) {
  const transport = custom(provider)
  const viemChain = toViemChain(chain)
  return {
    pub: createPublicClient({ chain: viemChain, transport }),
    wallet: createWalletClient({ chain: viemChain, transport, account }),
  }
}

export async function deploy({ pub, wallet }) {
  const hash = await wallet.deployContract({ abi: ABI, bytecode: artifact.bytecode })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  return { hash, address: receipt.contractAddress }
}

export async function write({ pub, wallet }, address, functionName, args) {
  const hash = await wallet.writeContract({ address, abi: ABI, functionName, args })
  await pub.waitForTransactionReceipt({ hash })
  return hash
}

export const read = ({ pub }, address, functionName, args) => pub.readContract({ address, abi: ABI, functionName, args })

export const balanceOf = ({ pub }, address) => pub.getBalance({ address })
