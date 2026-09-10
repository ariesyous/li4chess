import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const upstream = resolve(process.argv[2] ?? `${root}/arena-results/tetrarch-v8-upstream`);
const revision = '4a35cea06b710a6633302c2226ebfebbba52d7a4';
if (execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision)
  throw new Error('Wrong upstream revision');
if (execFileSync('git', ['-C', upstream, 'status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Upstream checkout must be clean');
const dest = `${root}/packages/tetrarch-engine/vendor/tetrarch`;
mkdirSync(dest, { recursive: true });
const files = ['LICENSE', 'src/c/tetrarch.c', 'nets/net-ffa1.nnue'];
const imported = files.map(source => {
  const name = source.split('/').at(-1);
  // Read the Git blob, avoiding checkout-dependent CRLF conversion.
  writeFileSync(`${dest}/${name}`, execFileSync('git', ['-C', upstream, 'show', `${revision}:${source}`], { maxBuffer: 8 * 1024 * 1024 }));
  const bytes = readFileSync(`${dest}/${name}`);
  return { source, name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
execFileSync(process.env.PYTHON ?? 'python', [`${root}/packages/tetrarch-engine/scripts/export-params.py`, upstream, dest], { stdio: 'inherit' });
for (const name of ['params.bin', 'reference.json']) {
  const bytes = readFileSync(`${dest}/${name}`);
  imported.push({ source: 'generated from pinned Python reference', name, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(`${dest}/manifest.json`, JSON.stringify({ repository: 'https://github.com/IchNukeDichWeg/Tetrarch', tag: 'v8', revision,
  license: 'MIT', copyright: 'Copyright (c) 2026 IchNukeDichWeg', openingBookRedistributed: false,
  networkRedistributed: true, upstreamPatches: [], imported }, null, 2) + '\n');
