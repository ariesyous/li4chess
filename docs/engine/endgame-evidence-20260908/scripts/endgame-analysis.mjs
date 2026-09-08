import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const dir=process.argv[2];
const games=gunzipSync(readFileSync(`${dir}/games.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
const byEngine={};
const details=games.map(g=>{
 const ownPrior=new Map();
 const per={};
 const progress=[];
 g.moves.forEach((r,i)=>{
  const id=g.engines[r.color].id;
  const counters=per[id]??={moves:0,quietKing:0,kingReturns:0,pawnMoves:0,captures:0};
  counters.moves++;
  const m=r.move;
  if(m.piece.type==='K'&&!m.captured) {counters.quietKing++;if(ownPrior.get(r.color)===m.to)counters.kingReturns++;ownPrior.set(r.color,m.from);}
  if(m.piece.type==='P') counters.pawnMoves++;
  if(m.captured)counters.captures++;
  if(m.piece.type==='P'||m.captured)progress.push({ply:i+1,color:r.color,from:m.from,to:m.to,type:m.piece.type,capture:m.captured?.type});
 });
 if(g.label.startsWith('validation'))for(const[id,counts]of Object.entries(per)) {const sum=byEngine[id]??={};for(const[k,v]of Object.entries(counts))sum[k]=(sum[k]??0)+v;}
 return {label:g.label,seed:g.seed,termination:g.termination,plies:g.plies,per,progress,result:g.result};
});
const output={byEngine,details};
writeFileSync(`${dir}/derived.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify({byEngine,replays:details.filter(g=>g.label.startsWith('replay')),games:games.length},null,2));
