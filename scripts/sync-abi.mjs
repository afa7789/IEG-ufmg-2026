// Copies ABI + bytecode from the forge artifact into public/ so the page can deploy from the browser.
import { readFile, writeFile } from 'node:fs/promises'

const artifact = JSON.parse(await readFile(new URL('../contracts/out/MessageInbox.sol/MessageInbox.json', import.meta.url), 'utf8'))
const out = { abi: artifact.abi, bytecode: artifact.bytecode.object }
await writeFile(new URL('../public/contract/MessageInbox.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log(`MessageInbox.json: ${out.abi.length} abi entries, ${(out.bytecode.length - 2) / 2} bytes of bytecode`)
