# ElGamal Inbox

Mensagens cifradas com **ElGamal clássico (Z<sub>p</sub><sup>*</sup>)** entregues por um contrato Ethereum.
O contrato só guarda `bytes` (chave pública por endereço, lista de `(c1, c2)` por destinatário).
Toda a criptografia roda no navegador.

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

## Estrutura

| Caminho | Papel |
|---|---|
| `contracts/src/MessageInbox.sol` | Registry de chaves públicas + inbox. Não conhece ElGamal. |
| `public/elgamal.js` | Wrapper fino sobre a lib [`elgamal`](https://www.npmjs.com/package/elgamal) (jsbn). Chave pública `(p, g, y)` ABI-codificada. |
| `public/contract.js` | viem: deploy, `registerPublicKey`, `publicKeys`, `sendMessage`, `getMessages`. |
| `public/app.js` | Tela principal (passos). |
| `public/admin.js` | Rede local: status RPC, faucet via `anvil_setBalance`, contas dev. |
| `public/about.html` | Descrição do projeto. |

Sem bundler: viem e elgamal vêm do esm.sh. GitHub Pages publica `public/` no push em `main` (`.github/workflows/pages.yml`).

## Relatório

**Esperado.** Uma demo ponta a ponta de ElGamal sobre blockchain: contrato enxuto, matemática off-chain, rede local e testnet, página hospedada.

**Alcançado.** Tudo acima. Fluxo Alice/Bob verificado em Anvil com teste automatizado (Playwright com carteira fake) e contrato publicado na Sepolia.

**Dificuldades.**
- NaCl/libsodium não implementam ElGamal (fazem X25519 + XSalsa20). Para ficar no esquema original foi preciso usar a lib `elgamal` (textbook, jsbn), pouco mantida.
- A lib depende de `crypto` e `Buffer` do Node. O build padrão do esm.sh saía com um import vazio; o modo `?bundle` resolveu, mais um `globalThis.Buffer` injetado antes do uso.
- A lib gera um `p` por chave, então a chave pública on-chain precisa carregar `(p, g, y)`, não só `y`.

**Desvios.** Hardhat foi trocado por Foundry (anvil já era requisito). O script CLI virou a própria UI. Chave de 512 bits (mensagens de até ~60 bytes) para manter a geração instantânea no navegador.

**Limitações assumidas.** ElGamal textbook (maleável, sem padding, sem CCA), chave privada em `localStorage`, metadados públicos na cadeia. É material de estudo, não um produto.
