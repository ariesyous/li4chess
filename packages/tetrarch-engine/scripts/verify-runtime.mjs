import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const pkg = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('runtime/manifest.json',pkg),'utf8'));
const vendor = JSON.parse(readFileSync(new URL('vendor/tetrarch/manifest.json',pkg),'utf8'));
if(manifest.revision !== vendor.revision || manifest.compiler !== '4.0.15') throw new Error('Browser runtime pin mismatch');
for(const [path,hash] of Object.entries({...manifest.inputs,...Object.fromEntries(Object.entries(manifest.hashes).map(([p,h])=>['runtime/'+p,h]))})) {
  if(createHash('sha256').update(readFileSync(new URL(path,pkg))).digest('hex') !== hash)
    throw new Error(`Browser runtime changed: ${path}; rebuild with build:browser`);
}
for(const entry of vendor.imported) {
  if(createHash('sha256').update(readFileSync(new URL('vendor/tetrarch/'+entry.name,pkg))).digest('hex') !== entry.sha256)
    throw new Error(`Vendor input changed: ${entry.name}`);
}
console.log('Pinned browser runtime and vendor inputs verified');
