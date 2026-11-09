# ElGamal Inbox

Mensagens cifradas com **ElGamal clássico (Z<sub>p</sub><sup>*</sup>)** entregues por um contrato Ethereum.
O contrato só guarda `bytes` (chave pública por endereço, lista de `(c1, c2)` por destinatário).
Toda a criptografia roda no navegador: **Botan (C++) compilado para WebAssembly**, com uma ponte em C.

Projeto da disciplina Criptografia 2026/2, DCC/ICEx/UFMG (Prof. Jeroen van de Graaf).

- **Demo:** https://afa7789.github.io/IEG-ufmg-2026/
- **Contrato na Sepolia:** [`0xC1305cE473067917CDBF9F1584422f48b965c202`](https://sepolia.etherscan.io/address/0xC1305cE473067917CDBF9F1584422f48b965c202)

## Como rodar

```bash
npm ci
npm start                 # http://localhost:8080
```

Rede local (opcional, requer [Foundry](https://getfoundry.sh)):

```bash
anvil --chain-id 31337 --block-time 2
```

Na página **Rede local** há os comandos, um botão para adicionar o Anvil na MetaMask, faucet e as contas de teste.
Na página **App**: conectar → escolher ou deployar o contrato → gerar e registrar a chave → enviar → ler a inbox.

Recompilar o contrato e atualizar o ABI usado pela página:

```bash
npm run build:contract
```

Regenerar o WebAssembly (baixa Botan 3.14.1, compila com Emscripten, linka `wasm/bridge.c`):

```bash
brew install emscripten
./wasm/build.sh          # → public/wasm/botan-elgamal.{js,wasm}
```

## Estrutura

| Caminho | Papel |
|---|---|
| `contracts/src/MessageInbox.sol` | Registry de chaves públicas + inbox. Não conhece ElGamal. |
| `wasm/bridge.c` | Ponte C sobre a FFI do [Botan](https://botan.randombit.net): `eg_keygen`, `eg_encrypt`, `eg_decrypt`, `eg_pub_fields`. RNG vem de `crypto.getRandomValues`. |
| `public/wasm/` | `botan-elgamal.wasm` (768 KB) + glue Emscripten, gerados por `wasm/build.sh` e commitados. |
| `public/elgamal.js` | Wrapper JS: heap, ponteiros, hex. Chave pública on-chain = DER SubjectPublicKeyInfo (p, g, y). |
| `public/contract.js` | viem: deploy, `registerPublicKey`, `publicKeys`, `sendMessage`, `getMessages`. |
| `public/app.js` | Tela principal (passos). |
| `public/admin.js` | Rede local: status RPC, faucet via `anvil_setBalance`, contas dev. |
| `public/about.html` | Descrição do projeto. |

Sem bundler: viem vem do esm.sh; o ElGamal é o `.wasm` local. GitHub Pages publica `public/` no push em `main` (`.github/workflows/pages.yml`).

## Relatório

**Esperado.** Uma demo ponta a ponta de ElGamal sobre blockchain: contrato enxuto, matemática off-chain, rede local e testnet, página hospedada.

**Alcançado.** Tudo acima, com ElGamal vindo de uma biblioteca C/C++ consolidada (Botan) rodando em WebAssembly. Fluxo Alice/Bob verificado em Anvil com teste automatizado (Playwright com carteira fake); contrato publicado na Sepolia. No navegador: keygen 2048 bits ≈ 16 ms, cifrar ≈ 48 ms, decifrar ≈ 33 ms.

**Dificuldades.**
- NaCl/libsodium não implementam ElGamal (fazem X25519 + XSalsa20). libtomcrypt, OpenSSL e mbedTLS também não. Botan tem ElGamal nativo e suporte oficial a Emscripten.
- Primeira versão usou a lib JS `elgamal` (jsbn) via esm.sh: precisou de `?bundle` e de um `Buffer` global. Foi substituída pelo wasm.
- Botan compila com `-fwasm-exceptions`; o link da ponte falhava até repetir a flag.
- O RNG do Botan precisa de entropia: resolvido com `botan_rng_init_custom` chamando `crypto.getRandomValues` via `EM_JS`.

**Desvios.** Hardhat foi trocado por Foundry (anvil já era requisito). O script CLI virou a própria UI. Grupo fixo `modp/ietf/2048` em vez de gerar p por chave.

**Limitações assumidas.** ElGamal textbook com padding `Raw` (maleável, sem CCA), chave privada em `localStorage`, metadados públicos na cadeia. É material de estudo, não um produto.
