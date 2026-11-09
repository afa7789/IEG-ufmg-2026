import { formatEther, isAddress } from 'https://esm.sh/viem@2.21.55'
import { byteLength } from './wasm-core.js'
import { CHAINS, DEFAULT_CHAIN, chainById } from './config.js'
import { balanceOf, clients, deploy, read, write } from './contract.js'
import { el } from './dom.js'
import { loadContacts, loadContract, loadKey, saveContacts, saveContract, saveKey } from './storage.js'
import { $, log, on, renderHeader, short } from './ui.js'
import { connect, discoverInjected, switchChain } from './wallets.js'

// Esquema vem do <body data-scheme>: 'elgamal' (index.html) ou 'mlkem' (pq.html). Mesma UI, mesmo contrato.
const scheme = await import(`./scheme-${document.body.dataset.scheme ?? 'elgamal'}.js`)

const state = { providers: [], provider: null, address: null, chainId: null, balance: null, contract: null, key: null, registered: false, messages: [], users: [], contacts: loadContacts() }

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
  if (!c) return `Rede não suportada (chainId ${state.chainId}). Troque para Sepolia ou Anvil no seletor.`
  const eth = state.balance == null ? '…' : Number(formatEther(state.balance)).toFixed(4)
  return `${short(state.address, 6)} · ${eth} ETH · ${c.name}`
}

const keyText = () => (state.key ? scheme.keyText(state.key) : '')

function render() {
  document.body.classList.toggle('connected', Boolean(state.address))
  $('walletBadge').textContent = state.address ? short(state.address, 4) : 'desconectado'
  $('walletState').textContent = walletText()
  if (chain()) $('chain').value = String(state.chainId)
  $('contractAddr').value = state.contract ?? ''
  $('contractState').textContent = state.contract ? `Usando ${state.contract}` : ''
  $('keyView').textContent = keyText()
  $('keyState').textContent = state.registered ? 'Chave pública registrada on-chain ✓' : (state.key ? 'Chave local ainda não registrada' : '')
  $('register').disabled = !state.key
  $('download').disabled = !state.key
  renderContacts()
  renderDirectory()
  renderInbox()
  renderSteps()
}

const aliasOf = (address) => state.contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())?.alias
const whoIs = (address) => (aliasOf(address) ? `${aliasOf(address)} (${short(address, 4)})` : short(address, 6))

function renderContacts() {
  const sel = $('contacts')
  const current = sel.value
  sel.replaceChildren(Object.assign(el('option', '', '—'), { value: '' }))
  for (const c of state.contacts) sel.append(Object.assign(el('option', '', `${c.alias} · ${short(c.address, 4)}`), { value: c.address }))
  sel.value = state.contacts.some((c) => c.address === current) ? current : ''
}

function renderDirectory() {
  const tbody = $('directory')
  tbody.replaceChildren()
  state.users.forEach((u, i) => {
    const me = u.toLowerCase() === state.address?.toLowerCase()
    const use = el('button', 'secondary small', 'usar')
    use.disabled = me
    use.addEventListener('click', () => { $('to').value = u; $('alias').value = aliasOf(u) ?? ''; $('alias').focus() })
    tbody.append(el('tr', '', el('td', '', String(i + 1)), el('td', '', u), el('td', '', me ? 'você' : (aliasOf(u) ?? '—')), el('td', '', use)))
  })
  $('directoryState').textContent = state.users.length ? `${state.users.length} endereço(s) com chave registrada` : ''
}

function renderInbox() {
  const tbody = $('inbox')
  tbody.replaceChildren()
  state.messages.forEach((m, i) => {
    const btn = el('button', 'secondary small', 'decifrar')
    btn.disabled = !state.key
    const cell = el('td', '', btn)
    btn.addEventListener('click', () => {
      try { cell.textContent = scheme.decrypt(state.key, m.c1, m.c2) } catch (e) { cell.textContent = `✕ ${e.message}` }
    })
    tbody.append(el('tr', '', el('td', '', String(i + 1)), el('td', '', whoIs(m.sender)), el('td', '', short(m.c1, 6)), el('td', '', short(m.c2, 6)), cell))
  })
  $('inboxState').textContent = state.address && ready() ? `${state.messages.length} mensagem(ns)` : ''
}

// ---- wallet ----

async function syncChainState() {
  const c = chain()
  state.contract = c ? (loadContract(scheme.id, state.chainId) ?? c.contracts[scheme.id] ?? null) : null
  state.key = c ? loadKey(scheme.id, state.chainId, state.address) : null
  state.messages = []
  state.users = []
  state.registered = false
  state.balance = c ? await balanceOf(api(), state.address) : null
  if (ready()) await syncRegistered()
}

async function syncRegistered() {
  if (!state.key) return
  const onchain = await read(api(), state.contract, 'publicKeys', [state.address])
  state.registered = onchain.toLowerCase() === scheme.encodePubKey(state.key).toLowerCase()
}

async function refreshWallet() {
  const { address, chainId } = await connect(state.provider)
  state.address = address
  state.chainId = chainId
  log(`Carteira ${short(address, 6)} na chain ${chainId}`)
  await syncChainState()
}

// Carteira em rede desconhecida: leva para a rede escolhida no seletor (Sepolia por padrão).
async function ensureSupportedChain() {
  if (chain()) return
  const target = chainById(Number($('chain').value)) ?? DEFAULT_CHAIN
  log(`Rede ${state.chainId} não suportada, pedindo troca para ${target.name}…`)
  await switchChain(state.provider, target)
  await refreshWallet()
}

async function doConnect() {
  const picked = state.providers[Number($('injected').value)]
  if (!picked) throw new Error('Nenhuma carteira injetada encontrada (instale a MetaMask)')
  state.provider = picked.provider
  picked.provider.on?.('chainChanged', () => refreshWallet().then(render))
  picked.provider.on?.('accountsChanged', () => refreshWallet().then(render))
  await refreshWallet()
  await ensureSupportedChain()
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
  saveContract(scheme.id, state.chainId, addr)
  state.contract = addr
  log(`Contrato definido: ${addr}`)
  return syncChainState()
}

function useDefault() {
  const addr = chain().contracts[scheme.id]
  if (!addr) throw new Error(`${chain().name} não tem contrato default para ${scheme.label}: faça deploy`)
  saveContract(scheme.id, state.chainId, null)
  state.contract = addr
  log(`Contrato default da rede: ${addr}`)
  return syncChainState()
}

async function doDeploy() {
  log('Enviando deploy do MessageInbox…')
  const { hash, address } = await deploy(api())
  saveContract(scheme.id, state.chainId, address)
  state.contract = address
  log(`Deploy ok em ${address} (tx ${short(hash, 6)})`)
  await syncChainState()
}

// ---- key ----

async function doKeygen() {
  log(scheme.describeKeygen())
  state.key = scheme.generate()
  saveKey(scheme.id, state.chainId, state.address, state.key)
  log(`Chave gerada (${scheme.label}): pública com ${(state.key.pub.length - 2) / 2} bytes`)
  await syncRegistered()
}

async function doRegister() {
  const pub = scheme.encodePubKey(state.key)
  log(`registerPublicKey (${(pub.length - 2) / 2} bytes)…`)
  const hash = await write(api(), state.contract, 'registerPublicKey', [pub])
  log(`Registrada (tx ${short(hash, 6)})`)
  await syncRegistered()
}

// ---- backup (.txt) ----

const KEY_FIELDS = ['priv', 'pub']

function keyFileText() {
  const k = state.key
  return [
    `Inbox Cifrada — chave privada ${scheme.label} (backup). Quem tiver este arquivo lê suas mensagens.`,
    `esquema: ${scheme.id}`,
    `rede: ${state.chainId} (${chain().name})`,
    `endereco: ${state.address}`,
    `gerada: ${new Date().toISOString()}`,
    `parametros: ${k.mode ?? `p=${k.pBytes * 8} bits, g=${k.g}`}`,
    `priv: ${k.priv}`,
    `pub: ${k.pub}`,
    '',
  ].join('\n')
}

function doDownload() {
  if (!state.key) throw new Error('Nenhuma chave para baixar')
  const blob = new Blob([keyFileText()], { type: 'text/plain' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${scheme.id}-key-${state.chainId}-${state.address.slice(2, 10)}.txt` })
  a.click()
  URL.revokeObjectURL(a.href)
  log('Backup da chave baixado')
}

// Aceita o .txt gerado acima: procura as linhas "priv:" e "pub:" (hex DER).
function parseKeyFile(text) {
  const found = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(priv|pub):\s*(0x[0-9a-fA-F]+)\s*$/)
    if (m) found[m[1]] = m[2]
    const mode = line.match(/^parametros:\s*(ML-KEM-\d+)\s*$/)
    if (mode) found.mode = mode[1]
  }
  if (!KEY_FIELDS.every((f) => found[f])) throw new Error('Arquivo não contém as linhas "priv:" e "pub:"')
  return found
}

async function doImport(file) {
  const { priv, pub, mode } = parseKeyFile(await file.text())
  state.key = { priv, pub, ...(mode ? { mode } : {}), ...scheme.decodePubKey(pub) }
  saveKey(scheme.id, state.chainId, state.address, state.key)
  log(`Chave importada de ${file.name}: y = ${short(state.key.y)}`)
  await syncRegistered()
}

// ---- contacts ----

function pickContact() {
  const c = state.contacts.find((x) => x.address === $('contacts').value)
  $('to').value = c?.address ?? ''
  $('alias').value = c?.alias ?? ''
}

function saveContact() {
  const address = $('to').value.trim()
  const alias = $('alias').value.trim()
  if (!isAddress(address)) throw new Error('Endereço inválido')
  if (!alias) throw new Error('Dê um apelido')
  state.contacts = [...state.contacts.filter((c) => c.address.toLowerCase() !== address.toLowerCase()), { address, alias }]
    .sort((a, b) => a.alias.localeCompare(b.alias))
  saveContacts(state.contacts)
  log(`Contato salvo: ${alias} = ${short(address, 6)}`)
  renderContacts()
  $('contacts').value = address
}

function removeContact() {
  const address = $('to').value.trim()
  const before = state.contacts.length
  state.contacts = state.contacts.filter((c) => c.address.toLowerCase() !== address.toLowerCase())
  if (state.contacts.length === before) throw new Error('Esse endereço não está nos contatos')
  saveContacts(state.contacts)
  $('alias').value = ''
  log(`Contato removido: ${short(address, 6)}`)
}

// ---- send / inbox ----

async function doSend() {
  const to = $('to').value.trim()
  const text = $('message').value
  if (!isAddress(to)) throw new Error('Destinatário inválido')
  if (!text) throw new Error('Mensagem vazia')
  const pubBytes = await read(api(), state.contract, 'publicKeys', [to])
  if (pubBytes === '0x') throw new Error('Destinatário ainda não registrou chave pública')
  const pub = scheme.decodePubKey(pubBytes)
  if (byteLength(text) > scheme.limitFor(pub)) throw new Error(`Mensagem longa demais: máximo ${scheme.limitFor(pub)} bytes`)
  const { c1, c2 } = scheme.encrypt(pub, text)
  $('sendView').textContent = `c1 = ${c1}\nc2 = ${c2}`
  log(`Mensagem cifrada (${(c1.length - 2) / 2} + ${(c2.length - 2) / 2} bytes), enviando…`)
  const hash = await write(api(), state.contract, 'sendMessage', [to, c1, c2])
  log(`Enviada para ${whoIs(to)} (tx ${short(hash, 6)})`)
  $('message').value = ''
}

async function doScan() {
  state.users = await read(api(), state.contract, 'getUsers', [])
  log(`Diretório: ${state.users.length} endereço(s) registrados`)
}

async function doRefresh() {
  state.messages = await read(api(), state.contract, 'getMessages', [state.address])
  log(`Inbox: ${state.messages.length} mensagem(ns)`)
}

// ---- init ----

async function init() {
  renderHeader(document.body.dataset.page ?? 'index.html')
  document.querySelectorAll('[data-scheme-label]').forEach((n) => { n.textContent = scheme.label })
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.href = b.dataset.go }))
  if (scheme.setMode && $('mode')) {
    for (const m of scheme.MODES) $('mode').append(Object.assign(el('option', '', m), { value: m }))
    $('mode').value = scheme.mode
    $('mode').addEventListener('change', () => scheme.setMode($('mode').value))
  }
  const chainSel = $('chain')
  chainSel.append(Object.assign(el('option', '', '—'), { value: '' }))
  for (const c of CHAINS) chainSel.append(Object.assign(el('option', '', c.name), { value: String(c.id) }))
  chainSel.value = String(DEFAULT_CHAIN.id)
  chainSel.addEventListener('change', () => pickChain().then(render).catch((e) => log(`ERRO ${e.message}`)))

  state.providers = await discoverInjected()
  const sel = $('injected')
  state.providers.forEach((p, i) => sel.append(Object.assign(el('option', '', p.info.name), { value: String(i) })))
  if (!state.providers.length) sel.append(el('option', '', 'nenhuma encontrada'))

  on('connect', doConnect, render)
  on('useContract', useContract, render)
  on('useDefault', useDefault, render)
  on('deploy', doDeploy, render)
  on('keygen', doKeygen, render)
  on('register', doRegister, render)
  on('download', doDownload, render)
  on('import', () => $('importFile').click(), render)
  $('importFile').addEventListener('change', () => {
    const [file] = $('importFile').files
    $('importFile').value = ''
    if (file) doImport(file).catch((e) => log(`ERRO ${e.message}`)).then(render)
  })
  on('send', doSend, render)
  on('saveContact', saveContact, render)
  on('removeContact', removeContact, render)
  $('contacts').addEventListener('change', pickContact)
  on('refresh', doRefresh, render)
  on('scan', doScan, render)
  render()
}

init()
