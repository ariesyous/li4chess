import assert from 'node:assert/strict';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {readReplay,equalCanonical,canonicalJson} from '../../packages/protocol/src/index.ts';
import {creationBoundary,exactReader,prepareCommand,digest} from '../../packages/persistence/src/index.ts';
import {verifySourceMap} from '../../apps/worker/test/campaign-source.ts';
const root=process.cwd(),base=resolve(root,process.argv[2]),committed=process.argv.includes('--committed');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const bytes=async(p:string)=>committed?execFileSync('git',['show','HEAD:'+relative(root,p).replaceAll('\\','/')],{maxBuffer:256*1024*1024}):readFile(p);
const json=async(p:string)=>JSON.parse((p.endsWith('.gz')?gunzipSync(await bytes(p)):await bytes(p)).toString());
const result={committed,indexedFiles:0,sourceMaps:[] as unknown[],replays:0,canonicalHistories:[] as unknown[]};
async function walk(dir:string):Promise<void>{
 const entries=await readdir(dir,{withFileTypes:true});
 for(const entry of entries){const p=resolve(dir,entry.name);if(entry.isDirectory()){await walk(p);continue;}
 if(entry.name==='artifact-index.json'){const index=await json(p);for(const f of index.files){const b=await bytes(resolve(dir,f.path));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256);if(f.decodedSha256)assert.equal(hash(gunzipSync(b)),f.decodedSha256);result.indexedFiles++;}}
 if(entry.name==='source-map.json.gz'){if(committed)assert.deepEqual(await readFile(p),await bytes(p));const map=await verifySourceMap(root,p);result.sourceMaps.push({path:relative(base,p),files:map.files.length,producer:map.producer});}
 if(entry.name.endsWith('.replay.json')){await readReplay(await json(p));result.replays++;}
 if(entry.name.endsWith('.canonical.json.gz')){
  const c=await json(p),name=entry.name.slice(0,-'.canonical.json.gz'.length),replay=await json(resolve(dir,name+'.replay.json'));
  let boundary=await creationBoundary(c.header,exactReader(c.header.replay.engineBuild));
  for(const command of c.commands){const {prepared,next}=await prepareCommand(boundary,command.record.owner,command.record.input,c.header.replay.engineBuild,command.record.format==='li4chess-d1-command-v2'?command.record.timing:undefined);assert(equalCanonical(prepared.record,command.record));assert(equalCanonical(prepared.receipt,command.receipt));assert(equalCanonical(prepared.events,replay.events.slice(command.record.firstEvent-1,command.record.lastEvent)));boundary=next;}
  assert(equalCanonical(boundary.state,c.final.state));assert(equalCanonical((await readReplay(replay)).state,c.final.state));
  for(const client of c.clients)assert(equalCanonical(client.state,c.final.state));
  for(let seat=0;seat<4;seat++)assert(equalCanonical(await json(resolve(dir,`${name}.member-${seat}.replay.json`)),replay));
  const imported=await json(resolve(dir,name+'.local-import.replay.json'));assert.equal(imported.game.sourceReplayHash,await digest(replay));assert(equalCanonical((await readReplay(imported)).state.position,c.final.state.position));
  result.canonicalHistories.push({path:relative(base,p),commands:c.commands.length,events:replay.events.length,randomActions:c.final.state.position.randomActions.length,result:c.final.state.position.result,sourceReplayHash:replay.game.sourceReplayHash??null});
 }
 }
}
await walk(base);console.log(JSON.stringify(result,null,2));
