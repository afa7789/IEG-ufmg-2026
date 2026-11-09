import { formatEther, isAddress, parseEther, toHex } from 'https://esm.sh/viem@2.21.55'
import { ANVIL, DEV_ACCOUNTS } from './config.js'
import { el } from './dom.js'
import { $, copyButton, log, on, renderHeader, short } from './ui.js'
import { addChain, discoverInjected } from './wallets.js'

const COMMANDS = [
  ['Subir a rede', 'anvil --chain-id 31337 --block-time 2'],
  ['Compilar o contrato', 'forge build --root contracts'],
  ['Deploy via CLI (conta #0)', `forge create src/MessageInbox.sol:MessageInbox --root contracts --rpc-url ${ANVIL.rpc} --private-key ${DEV_ACCOUNTS[0].key} --broadcast`],
  ['Dar ETH via CLI', `cast rpc anvil_setBalance <endereço> ${toHex(parseEther('100'))} --rpc-url ${ANVIL.rpc}`],
]

async function rpc(method, params = []) {
  const res = await fetch(ANVIL.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

const address = () => {
  const a = $('faucetAddr').value.trim()
  if (!isAddress(a)) throw new Error('Endereço inválido')
  return a
}

async function ping() {
  const [chainId, block] = await Promise.all([rpc('eth_chainId'), rpc('eth_blockNumber')])
  $('rpcState').textContent = `Online · chainId ${Number(chainId)} · bloco ${Number(block)}`
  log(`RPC ${ANVIL.rpc} ok, bloco ${Number(block)}`)
}

async function doAddChain() {
  const [picked] = await discoverInjected()
  if (!picked) throw new Error('Nenhuma carteira injetada encontrada')
  await addChain(picked.provider, ANVIL)
  $('chainState').textContent = `${ANVIL.name} adicionada em ${picked.info.name} ✓`
  const [acct] = await picked.provider.request({ method: 'eth_accounts' }).catch(() => [])
  if (acct && !$('faucetAddr').value) $('faucetAddr').value = acct
}

async function showBalance() {
  const wei = await rpc('eth_getBalance', [address(), 'latest'])
  $('faucetState').textContent = `Saldo: ${Number(formatEther(BigInt(wei))).toFixed(4)} ETH`
}

async function faucet() {
  await rpc('anvil_setBalance', [address(), toHex(parseEther('100'))])
  log(`anvil_setBalance 100 ETH → ${short(address(), 6)}`)
  await showBalance()
}

function renderCommands() {
  for (const [label, cmd] of COMMANDS) {
    const pre = el('pre', '', cmd)
    $('commands').append(el('p', 'hint', label), el('div', 'command', pre, copyButton(cmd)))
  }
}

function renderAccounts() {
  for (const a of DEV_ACCOUNTS) {
    $('accounts').append(el('tr', '',
      el('td', '', String(a.index)),
      el('td', '', a.address, ' ', copyButton(a.address)),
      el('td', '', short(a.key, 8), ' ', copyButton(a.key)),
    ))
  }
}

function init() {
  renderHeader('admin.html')
  renderCommands()
  renderAccounts()
  on('ping', ping)
  on('addChain', doAddChain)
  on('faucet', faucet)
  on('balance', showBalance)
  ping().catch((e) => { $('rpcState').textContent = `Offline: ${e.message}` })
}

init()
