// Redes suportadas. `contract` é o endereço default; o usuário pode sobrescrever (deploy pela UI → localStorage).
export const CHAINS = [
  { id: 31337, name: 'Anvil (local)', rpc: 'http://127.0.0.1:8545', explorer: null, contract: null },
  { id: 11155111, name: 'Sepolia', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.etherscan.io', contract: '0xC1305cE473067917CDBF9F1584422f48b965c202' },
]

export const ANVIL = CHAINS[0]
export const chainById = (id) => CHAINS.find((c) => c.id === id)

// Grupo DL do Botan usado na geração de chaves (p de 2048 bits → mensagens de até 255 bytes).
export const DL_GROUP = 'modp/ietf/2048'
export const MAX_MESSAGE_BYTES = 200

// Contas padrão do anvil (mnemonic "test test ... junk"). Chaves públicas e conhecidas: só para rede local.
export const DEV_ACCOUNTS = [
  { index: 0, address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  { index: 1, address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  { index: 2, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
  { index: 3, address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' },
]

export const REPO = 'https://github.com/afa7789/IEG-ufmg-2026'
