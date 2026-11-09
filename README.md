# ElGamal Inbox

Mensagens cifradas com **ElGamal clássico (Z<sub>p</sub><sup>*</sup>)** entregues por um contrato Ethereum.
O contrato só guarda `bytes` (chave pública por endereço, lista de `(c1, c2)` por destinatário).
Toda a criptografia roda no navegador: **Botan (C++) compilado para WebAssembly**, com uma ponte em C. Tem também uma **versão pós-quântica** (ML-KEM + AES-GCM) sobre o mesmo contrato, e um **ataque** (Pollard rho) que quebra chaves pequenas.

Projeto da disciplina Criptografia 2026/2, DCC/ICEx/UFMG (Prof. Jeroen van de Graaf).

- **Demo:** https://afa7789.github.io/IEG-ufmg-2026/
- **Contrato na Sepolia (ElGamal):** [`0x5641e5ec07332023b8354f96a36e7986B482656c`](https://sepolia.etherscan.io/address/0x5641e5ec07332023b8354f96a36e7986B482656c)
- **Contrato na Sepolia (ML-KEM, mesmo bytecode):** [`0xe2232f3a20ffa8273461DE25464a2B7CdF801b15`](https://sepolia.etherscan.io/address/0xe2232f3a20ffa8273461DE25464a2B7CdF801b15)

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
A chave privada fica no `localStorage` do navegador. **Baixe o backup (.txt)** no passo 3; o mesmo arquivo restaura a chave em outro navegador via "Importar".
No passo 4 dá para salvar destinatários com apelido (também em `localStorage`); o apelido aparece na caixa de entrada. "Buscar no contrato" lista quem já registrou chave (`getUsers()`), para descobrir destinatários.

Recompilar o contrato e atualizar o ABI usado pela página:

```bash
npm run build:contract
```

Teste ponta a ponta em Anvil, com vídeo e log (artefatos em `public/media/`, exibidos na página **Sobre**):

```bash
npm run test:install     # uma vez: baixa o Chromium headless do Playwright
npm test                 # sobe anvil + servidor, roda Alice → Bob → Alice, grava demo-anvil.webm + .log
```

Versão pós-quântica (página **Pós-quântico**) e comparação com gas real em Anvil:

```bash
npm run test:pq          # mesmo fluxo Alice → Bob → Alice com ML-KEM; grava demo-anvil-pq.{webm,log}
npm run compare          # tamanhos, tempos e gas de registerPublicKey/sendMessage por esquema → compare.{json,log}
```

Benchmark do ataque (página **Ataque**: chaves de 16 a 64 bits quebradas por Pollard rho; grava `public/media/bench-dlp.{json,log}`):

```bash
npm run bench            # ~3 min; BENCH_TO=48 npm run bench para uma rodada curta
```

A página **Sobre** tem um **Modo slide** (botão no topo ou `about.html#slides`): setas avançam, Esc sai. Serve de apresentação.

Regenerar o WebAssembly (baixa Botan 3.14.1, compila com Emscripten, linka `wasm/bridge.c`):

```bash
brew install emscripten
./wasm/build.sh          # → public/wasm/botan-elgamal.{js,wasm}
```

## Estrutura

| Caminho | Papel |
|---|---|
| `contracts/src/MessageInbox.sol` | Registry de chaves públicas + inbox + `getUsers()` (diretório de quem registrou). Não conhece ElGamal. |
| `wasm/bridge.c` | Ponte C sobre a FFI do [Botan](https://botan.randombit.net): `eg_keygen`, `eg_encrypt`, `eg_decrypt`, `eg_pub_fields`. RNG vem de `crypto.getRandomValues`. Também o ataque: `dlp_start/run` (Pollard rho, Montgomery 64 bits). |
| `wasm/bridge_weak.cpp` | API C++ do Botan: chaves fracas (p de 8–64 bits, primo seguro) e `eg_decrypt_with_x` (decifra com o x recuperado). |
| `public/wasm/` | `botan-elgamal.wasm` (768 KB) + glue Emscripten, gerados por `wasm/build.sh` e commitados. |
| `public/wasm-core.js` | Instancia o wasm e expõe helpers de heap/hex para os esquemas. |
| `public/elgamal.js` + `scheme-elgamal.js` | Wrapper ElGamal: chave pública on-chain = DER SubjectPublicKeyInfo (p, g, y). |
| `public/contract.js` | viem: deploy, `registerPublicKey`, `publicKeys`, `sendMessage`, `getMessages`. |
| `public/app.js` | Tela principal (passos). |
| `public/admin.js` | Rede local: status RPC, faucet via `anvil_setBalance`, contas dev. |
| `public/attack.html` + `attack.js` + `attack-worker.js` | Ataque: chave fraca (Botan), Pollard rho em wasm num Web Worker, benchmark e projeção. |
| `public/pq.html` + `scheme-mlkem.js` + `pq.js` + `compare.js` | Versão pós-quântica: ML-KEM (512/768/1024) + HKDF + AES-256/GCM, mesma UI (`app.js` com esquema plugável), comparação de esquemas. |
| `wasm/bridge_pq.c` | FFI do Botan: `pq_keygen`, `pq_encrypt` (encapsula + AEAD), `pq_decrypt`. |
| `public/about.html` + `slides.js` | Descrição do projeto, vídeo/log da demo, tabela do benchmark e modo slide. |
| `test/e2e.mjs` | Teste E2E (Playwright + carteira fake → Anvil). Grava `public/media/demo-anvil.{webm,log}`. |

Sem bundler: viem vem do esm.sh; o ElGamal é o `.wasm` local. GitHub Pages publica `public/` no push em `main` (`.github/workflows/pages.yml`).

## Relatório

**Esperado.** Uma demo ponta a ponta de ElGamal sobre blockchain: contrato enxuto, matemática off-chain, rede local e testnet, página hospedada.

**Alcançado.** Tudo acima, com ElGamal vindo de uma biblioteca C/C++ consolidada (Botan) rodando em WebAssembly, uma versão pós-quântica (ML-KEM + AES-GCM) sobre o mesmo contrato com comparação de tamanhos, tempos e gas, mais a parte de análise: ataque por log discreto (Pollard rho) que quebra chaves de até 64 bits no navegador (64 bits em ~2,5 min, 47 M iterações/s) e projeta o custo para 2048 bits (≈ 10^293 anos com esse método). Fluxo Alice/Bob verificado em Anvil com teste automatizado (`npm test`, Playwright com carteira fake), que também grava o vídeo e o log mostrados na página Sobre; contrato publicado na Sepolia. No navegador: keygen 2048 bits ≈ 16 ms, cifrar ≈ 48 ms, decifrar ≈ 33 ms.

**Dificuldades.**
- NaCl/libsodium não implementam ElGamal (fazem X25519 + XSalsa20). libtomcrypt, OpenSSL e mbedTLS também não. Botan tem ElGamal nativo e suporte oficial a Emscripten.
- Primeira versão usou a lib JS `elgamal` (jsbn) via esm.sh: precisou de `?bundle` e de um `Buffer` global. Foi substituída pelo wasm.
- Botan compila com `-fwasm-exceptions`; o link da ponte falhava até repetir a flag.
- O RNG do Botan precisa de entropia: resolvido com `botan_rng_init_custom` chamando `crypto.getRandomValues` via `EM_JS`.
- A FFI do Botan não monta `DL_Group` com q, e o DER exige q: as chaves fracas foram para C++ (`bridge_weak.cpp`).
- Worker com top-level `await` perdia a primeira mensagem (corrida com o carregamento do wasm): handler síncrono + `import()` dinâmico.
- Medir gas de registro com a mesma conta distorcia (reescrever slot custa 2 900, criar custa 20 000): uma conta por esquema.

**Desvios.** Hardhat foi trocado por Foundry (anvil já era requisito). O script CLI virou a própria UI. Grupo fixo `modp/ietf/2048` em vez de gerar p por chave. O contrato ganhou `getUsers()`: varrer eventos `PublicKeyRegistered` via `eth_getLogs` em RPC público travava com janelas grandes; um array on-chain resolve com uma chamada.

**Limitações assumidas.** ElGamal textbook com padding `Raw` (maleável, sem CCA), chave privada em `localStorage` e no `.txt` de backup em claro, metadados públicos na cadeia. É material de estudo, não um produto.
