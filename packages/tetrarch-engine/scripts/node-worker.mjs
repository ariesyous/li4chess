// Node-only adviser transport. Canonical GameState and move authority stay in the parent.
import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import createModule from '../.generated/tetrarch.mjs';
import { ResearchWasm } from '../dist/src/wasm.js';

const manifest = JSON.parse(await readFile(new URL('../vendor/tetrarch/manifest.json', import.meta.url), 'utf8'));
async function asset(name) {
  const bytes = await readFile(new URL(`../vendor/tetrarch/${name}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.imported.find(f => f.name === name)?.sha256)
    throw new Error(`Asset hash mismatch: ${name}`);
  return bytes;
}
const [binary, params, net] = await Promise.all([
  readFile(new URL('../.generated/tetrarch.wasm', import.meta.url)), asset('params.bin'), asset('net-ffa1.nnue'),
]);
const engine = new ResearchWasm(await createModule({ wasmBinary: binary }), params, net);
parentPort.on('message', request => {
  try {
    engine.setPosition(request.squares, request.meta);
    const result = engine.search(request.budget);
    parentPort.postMessage({ id: request.id, stateId: request.stateId, result });
  } catch (error) {
    parentPort.postMessage({ id: request.id, stateId: request.stateId, error: String(error) });
  }
});
