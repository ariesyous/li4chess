import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {applyMove,legalMoves,PieceType} from '../packages/engine/src/index.ts';
import {pawnEndgameScore} from '../packages/bot/src/index.ts';
const dirs=process.argv.slice(2);
const games=dirs.flatMap(dir=>gunzipSync(readFileSync(`${dir}/games.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse)).filter(g=>g.label.startsWith('validation'));
const counts:Record<string,number>={};
for(const game of games){let state=game.initial;for(const record of game.moves){
 const m=record.move,next=applyMove(state,m),id=game.engines[record.color].id;
 counts[id]??=0;
 if(m.piece.type===PieceType.King&&!m.captured){const before=pawnEndgameScore(state,state.turn);
 if(pawnEndgameScore(next,state.turn)<=before&&legalMoves(state).some(p=>{
  if(p.piece.type!==PieceType.Pawn)return false;
  const after=applyMove(state,p);
  return !after.result&&pawnEndgameScore(after,state.turn)>before&&!legalMoves(after).some(reply=>reply.to===p.to&&reply.captured);
 }))counts[id]++;
 }state=next;
}}
writeFileSync(`${dirs[0]}/plan-misses.json`,JSON.stringify(counts,null,2));console.log(counts);
