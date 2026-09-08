import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {legalMoves} from '../packages/engine/src/index.ts';
import {scoreMovesExactly,evaluateFull} from '../packages/bot/src/index.ts';
import {evaluateFull as baseline} from '../packages/arena/src/endgame-baseline/evaluate.ts';
import {reconstructEndgameReplay} from '../packages/arena/src/endgame-replay.ts';
const {snapshots}=await reconstructEndgameReplay();
const state=snapshots[238];
const output=[];
for(const [name,evaluate]of [['baseline',baseline],['candidate',evaluateFull]]as const)for(let depth=1;depth<=5;depth++){
 let nodes=0;const start=performance.now();
 const choices=scoreMovesExactly(state,state.turn,legalMoves(state),{maxDepth:depth,evaluate,budget:{check(){},visit(){nodes++;}}});
 output.push({name,depth,nodes,elapsedMs:performance.now()-start,choices:choices.map(x=>({from:x.move.from,to:x.move.to,value:x.value}))});
}
writeFileSync(resolve(process.argv[2]),JSON.stringify(output,null,2));
console.log(JSON.stringify(output.map(x=>({...x,choices:x.choices.slice(0,1)})),null,2));

