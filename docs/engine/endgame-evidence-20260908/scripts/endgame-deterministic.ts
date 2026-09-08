import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {chooseBoundedCpuMove} from '../packages/bot/src/index.ts';
import {chooseBoundedCpuMove as baseline} from '../packages/arena/src/endgame-baseline/bounded.ts';
import {reconstructEndgameReplay} from '../packages/arena/src/endgame-replay.ts';
import {runGame,replay} from '../packages/arena/src/index.ts';
import {createRunDirectory,readBuildIdentity,runtimeEnvironment} from '../packages/protocol/src/node.js';
const out=process.argv[2];createRunDirectory(out);
const budget={maxDepth:3,nodeBudget:2048,timeMs:null};
writeFileSync(`${out}/run.json`,JSON.stringify({build:readBuildIdentity(),environment:runtimeEnvironment(),budget,random:'constant .99',cap:32},null,2));
const adapter=(id:string,choose:typeof baseline)=>({id,config:{budget,random:'.99'},choose:(state:any)=>{const r=choose(state,3,budget,()=>.99);return{move:r.move,stats:r.diagnostics};}});
const a=adapter('baseline',baseline),b=adapter('candidate',chooseBoundedCpuMove);
const {state:initial}=await reconstructEndgameReplay();
const games=[];
for(const seats of [[a,a,a,a],[a,b,b,b]]as const){const game=await runGame(seats,{initial,seed:0,maxPlies:32});await replay(game);games.push(game);}
writeFileSync(`${out}/games.jsonl.gz`,gzipSync(games.map(JSON.stringify).join('\n')+'\n'));
console.log(games.map(g=>({engines:g.engines.map(e=>e.id),progress:g.moves.flatMap((m,i)=>m.move.captured||m.move.piece.type==='P'?[{ply:i+1,move:m.move}]:[])})));
