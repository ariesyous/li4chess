import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
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
mkdirSync(`${pkg}/.generated`, { recursive: true });
const exports = ['malloc', 'free', 'tt_params_size', 'tt_init', 'tt_ready', 'tt_alloc', 'tt_clear', 'tt_net_loaded',
  'sp_board', 'sp_load_net', 'sp_legal', 'sp_search', 'sp_nodes', 'sp_best', 'sp_score', 'sp_aborted', 'sp_eval', 'sp_pv'];
compile([`${pkg}/native/bridge.c`, '-O3', '-std=c11', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
  '-sENVIRONMENT=node,web,worker', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sSTACK_SIZE=2097152',
  '-sFILESYSTEM=0', `-sEXPORTED_FUNCTIONS=${exports.map(x => `_${x}`).join(',')}`,
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8', '-o', `${pkg}/.generated/tetrarch.mjs`],
  { stdio: 'inherit' });
