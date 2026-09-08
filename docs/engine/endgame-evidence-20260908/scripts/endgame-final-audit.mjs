import {readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=resolve('docs/engine/endgame-evidence-20260908');
for(const file of ['packages/bot/test/pawn-endgame.test.ts','packages/arena/test/endgame-replay.test.ts','packages/arena/src/endgame-replay.ts','packages/arena/src/endgame-comparison.ts','packages/arena/fixtures/endgame/README.md',resolve(root,'README.md')]) {
 const lines=readFileSync(file,'utf8').split(/\r?\n/);assert(lines.every(line=>!/[\t ]+$/.test(line)),`Trailing whitespace: ${file}`);
}
const readGames=part=>gunzipSync(readFileSync(resolve(root,part,'games.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse);
const primary=readGames('primary').filter(g=>g.label.startsWith('validation'));
const reverse=readGames('reverse');
assert.equal(primary.length,24);assert.equal(reverse.length,24);
for(const game of primary){const other=reverse.find(g=>g.label===game.label&&g.seed===game.seed);assert(other);assert.deepEqual(game.initial,other.initial);assert(game.engines.every((e,i)=>e.id!==other.engines[i].id));}
const production=readFileSync('packages/bot/src/evaluate.ts');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const part of ['primary','reverse'])assert.equal(JSON.parse(readFileSync(resolve(root,part,'source-hashes.json')))['packages/bot/src/evaluate.ts'],hash(production));
const files=['README.md','ROADMAP.md','docs/project-state.md','packages/arena/fixtures/endgame/README.md',resolve(root,'README.md')];
if(!existsSync(resolve(root,'manifest.json')))writeFileSync(resolve(root,'manifest.json'),'{}');
let links=0;
for(const file of files){const text=readFileSync(file,'utf8');for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
 const target=m[1].split('#')[0];if(!target||/^(https?:|mailto:)/.test(target))continue;
 assert(existsSync(resolve(dirname(file),decodeURIComponent(target))),`${file}: missing ${target}`);links++;
}}
const paths=[];function walk(dir){for(const item of readdirSync(dir)){const path=resolve(dir,item);if(statSync(path).isDirectory())walk(path);else if(path!==resolve(root,'manifest.json'))paths.push(path);}}walk(root);
const manifest={format:'li4chess-endgame-evidence-v1',date:'2026-09-08',files:Object.fromEntries(paths.sort().map(path=>[relative(root,path).replaceAll('\\','/'),{bytes:statSync(path).size,sha256:hash(readFileSync(path))}]))};
writeFileSync(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const [file,entry]of Object.entries(manifest.files))assert.equal(hash(readFileSync(resolve(root,file))),entry.sha256);
console.log(JSON.stringify({pairedStarts:24,reversedAssignments:24,productionSourceMatchesBothRuns:true,localLinks:links,artifactChecksums:Object.keys(manifest.files).length}));
