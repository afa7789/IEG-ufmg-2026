import { formatEther, isAddress } from 'https://esm.sh/viem@2.21.55'
import { CHAINS, KEY_BITS, chainById } from './config.js'
import { balanceOf, clients, deploy, read, write } from './contract.js'
import { el } from './dom.js'
import { decodePubKey, decrypt, encodePubKey, encrypt, keygen } from './elgamal.js'
import { loadContract, loadKey, saveContract, saveKey } from './storage.js'
import { $, log, on, renderHeader, short } from './ui.js'
import { connect, discoverInjected, switchChain } from './wallets.js'

const state = { providers: [], provider: null, address: null, chainId: null, balance: null, contract: null, key: null, registered: false, messages: [] }

const chain = () => chainById(state.chainId)
const api = () => clients(state.provider, chain(), state.address)
const ready = () => Boolean(state.address && chain() && state.contract)

// ---- steps ----

const gate = (open, s) => (open ? s : 'locked')

function stepStates() {
  const wallet = Boolean(state.address && chain())
  return {
    stepWallet: wallet ? 'done' : 'current',
    stepContract: gate(wallet, state.contract ? 'done' : 'current'),
    stepKey: gate(ready(), state.registered ? 'done' : 'current'),
    stepSend: gate(ready(), 'current'),
    stepInbox: gate(ready(), 'current'),
  }
}

function renderSteps() {
  for (const [id, step] of Object.entries(stepStates())) {
    $(id).dataset.state = step
    $(id).disabled = step === 'locked'
    document.querySelector(`.progress [data-step="${id}"]`).dataset.state = step
  }
}

// ---- render ----

function walletText() {
  if (!state.address) return ''
  const c = chain()
  if (!c) return `Rede não suportada (chainId ${state.chainId}). Escolha Anvil ou Sepolia no seletor.`
  const eth = state.balance == null ? '…' : Number(formatEther(state.balance)).toFixed(4)
  return `${short(state.address, 6)} · ${eth} ETH · ${c.name}`
}

function keyText() {
  if (!state.key) return ''
  return `p = ${short(state.key.p)}\ng = ${state.key.g}\ny = ${short(state.key.y)}\nx = (privada, ${(state.key.x.length - 2) / 2} bytes, no localStorage)`
}

function render() {
  document.body.classList.toggle('connected', Boolean(state.address))
  $('walletBadge').textContent = state.address ? short(state.address, 4) : 'desconectado'
  $('walletState').textContent = walletText()
  $('chain').value = chain() ? String(state.chainId) : ''
  $('contractAddr').value = state.contract ?? ''
  $('contractState').textContent = state.contract ? `Usando ${state.contract}` : ''
  $('keyView').textContent = keyText()
  $('keyState').textContent = state.registered ? 'Chave pública registrada on-chain ✓' : (state.key ? 'Chave local ainda não registrada' : '')
  $('register').disabled = !state.key
  renderInbox()
  renderSteps()
}

function renderInbox() {
  const tbody = $('inbox')
  tbody.replaceChildren()
  state.messages.forEach((m, i) => {
    const btn = el('button', 'secondary small', 'decifrar')
    btn.disabled = !state.key
    const cell = el('td', '', btn)
    btn.addEventListener('click', async () => {
      try { cell.textContent = await decrypt(state.key, m.c1, m.c2) } catch (e) { cell.textContent = `✕ ${e.message}` }
    })
    tbody.append(el('tr', '', el('td', '', String(i + 1)), el('td', '', short(m.sender, 6)), el('td', '', short(m.c1, 6)), el('td', '', short(m.c2, 6)), cell))
  })
  $('inboxState').textContent = state.address && ready() ? `${state.messages.length} mensagem(ns)` : ''
}

// ---- wallet ----

async function syncChainState() {
  const c = chain()
  state.contract = c ? (loadContract(state.chainId) ?? c.contract) : null
  state.key = c ? loadKey(state.chainId, state.address) : null
  state.messages = []
  state.registered = false
  state.balance = c ? await balanceOf(api(), state.address) : null
  if (ready()) await syncRegistered()
}

async function syncRegistered() {
  if (!state.key) return
  const onchain = await read(api(), state.contract, 'publicKeys', [state.address])
  state.registered = onchain.toLowerCase() === encodePubKey(state.key).toLowerCase()
}

async function refreshWallet() {
  const { address, chainId } = await connect(state.provider)
  state.address = address
  state.chainId = chainId
  log(`Carteira ${short(address, 6)} na chain ${chainId}`)
  await syncChainState()
}

async function doConnect() {
  const picked = state.providers[Number($('injected').value)]
  if (!picked) throw new Error('Nenhuma carteira injetada encontrada (instale a MetaMask)')
  state.provider = picked.provider
  picked.provider.on?.('chainChanged', () => refreshWallet().then(render))
  picked.provider.on?.('accountsChanged', () => refreshWallet().then(render))
  await refreshWallet()
}

async function pickChain() {
  const target = chainById(Number($('chain').value))
  if (!target || !state.provider) return
  await switchChain(state.provider, target)
  await refreshWallet()
}

// ---- contract ----

function useContract() {
  const addr = $('contractAddr').value.trim()
  if (!isAddress(addr)) throw new Error('Endereço inválido')
  saveContract(state.chainId, addr)
  state.contract = addr
  log(`Contrato definido: ${addr}`)
  return syncChainState()
}

async function doDeploy() {
  log('Enviando deploy do MessageInbox…')
  const { hash, address } = await deploy(api())
  saveContract(state.chainId, address)
  state.contract = address
  log(`Deploy ok em ${address} (tx ${short(hash, 6)})`)
  await syncChainState()
}

// ---- key ----

async function doKeygen() {
  log(`Gerando chave ElGamal de ${KEY_BITS} bits…`)
  state.key = await keygen(KEY_BITS)
  saveKey(state.chainId, state.address, state.key)
  log(`Chave gerada: y = ${short(state.key.y)}`)
  await syncRegistered()
}

async function doRegister() {
  const pub = encodePubKey(state.key)
  log(`registerPublicKey (${(pub.length - 2) / 2} bytes)…`)
  const hash = await write(api(), state.contract, 'registerPublicKey', [pub])
  log(`Registrada (tx ${short(hash, 6)})`)
  await syncRegistered()
}

// ---- send / inbox ----

async function doSend() {
  const to = $('to').value.trim()
  const text = $('message').value
  if (!isAddress(to)) throw new Error('Destinatário inválido')
  if (!text) throw new Error('Mensagem vazia')
  const pubBytes = await read(api(), state.contract, 'publicKeys', [to])
  if (pubBytes === '0x') throw new Error('Destinatário ainda não registrou chave pública')
  const { c1, c2 } = await encrypt(decodePubKey(pubBytes), text)
  $('sendView').textContent = `c1 = ${c1}\nc2 = ${c2}`
  log(`Mensagem cifrada (${(c1.length - 2) / 2} + ${(c2.length - 2) / 2} bytes), enviando…`)
  const hash = await write(api(), state.contract, 'sendMessage', [to, c1, c2])
  log(`Enviada para ${short(to, 6)} (tx ${short(hash, 6)})`)
  $('message').value = ''
}

async function doRefresh() {
  state.messages = await read(api(), state.contract, 'getMessages', [state.address])
  log(`Inbox: ${state.messages.length} mensagem(ns)`)
}

// ---- init ----

async function init() {
  renderHeader('index.html')
  const chainSel = $('chain')
  chainSel.append(Object.assign(el('option', '', '—'), { value: '' }))
  for (const c of CHAINS) chainSel.append(Object.assign(el('option', '', c.name), { value: String(c.id) }))
  chainSel.addEventListener('change', () => pickChain().then(render).catch((e) => log(`ERRO ${e.message}`)))

  state.providers = await discoverInjected()
  const sel = $('injected')
  state.providers.forEach((p, i) => sel.append(Object.assign(el('option', '', p.info.name), { value: String(i) })))
  if (!state.providers.length) sel.append(el('option', '', 'nenhuma encontrada'))

  on('connect', doConnect, render)
  on('useContract', useContract, render)
  on('deploy', doDeploy, render)
  on('keygen', doKeygen, render)
  on('register', doRegister, render)
  on('send', doSend, render)
  on('refresh', doRefresh, render)
  render()
}

init()
