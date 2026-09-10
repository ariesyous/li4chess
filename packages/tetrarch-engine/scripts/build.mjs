import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(`${pkg}/vendor/tetrarch/manifest.json`, 'utf8'));
for (const file of manifest.imported) {
  if (createHash('sha256').update(readFileSync(`${pkg}/vendor/tetrarch/${file.name}`)).digest('hex') !== file.sha256)
    throw new Error(`Input hash mismatch: ${file.name}`);
}
const emcc = process.env.EMCC ?? 'emcc';
function compile(args, options = {}) {
  if (process.platform === 'win32') {
    if (!process.env.EMSDK_PYTHON || !emcc.endsWith('.bat'))
      throw new Error('Windows: set EMCC to emcc.bat and EMSDK_PYTHON to the SDK python.exe');
    return execFileSync(process.env.EMSDK_PYTHON, [emcc.replace(/\.bat$/, '.py'), ...args], options);
  }
  return execFileSync(emcc, args, options);
}
const version = compile(['--version'], { encoding: 'utf8' });
if (!version.includes('4.0.15')) throw new Error('This proof pins Emscripten 4.0.15');
const browser = process.argv.includes('--browser');
const output = browser ? 'runtime' : '.generated';
mkdirSync(`${pkg}/${output}`, { recursive: true });
const exports = ['malloc', 'free', 'tt_params_size', 'tt_init', 'tt_ready', 'tt_alloc', 'tt_clear', 'tt_net_loaded',
  'sp_board', 'sp_load_net', 'sp_legal', 'sp_search', 'sp_nodes', 'sp_best', 'sp_score', 'sp_aborted', 'sp_eval', 'sp_pv'];
compile([`${pkg}/native/bridge.c`, '-O3', '-std=c11', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
  `-sENVIRONMENT=${browser ? 'web,worker' : 'node,web,worker'}`, '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sSTACK_SIZE=2097152',
  '-sFILESYSTEM=0', `-sEXPORTED_FUNCTIONS=${exports.map(x => `_${x}`).join(',')}`,
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8', '-o', `${pkg}/${output}/tetrarch.mjs`],
  { stdio: 'inherit' });
if (browser) {
  const hashes = Object.fromEntries(['tetrarch.mjs','tetrarch.wasm'].map(name => [name,
    createHash('sha256').update(readFileSync(`${pkg}/runtime/${name}`)).digest('hex')]));
  const inputs = Object.fromEntries(['native/bridge.c','vendor/tetrarch/tetrarch.c','scripts/build.mjs'].map(name=>[name,
    createHash('sha256').update(readFileSync(`${pkg}/${name}`)).digest('hex')]));
  writeFileSync(`${pkg}/runtime/manifest.json`, JSON.stringify({ revision: manifest.revision, compiler: '4.0.15', hashes, inputs }, null, 2)+'\n');
}
