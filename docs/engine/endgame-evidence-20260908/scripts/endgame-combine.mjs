import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const dirs=process.argv.slice(2);
const games=dirs.flatMap(dir=>gunzipSync(readFileSync(`${dir}/games.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse)).filter(g=>g.label.startsWith('validation'));
const complete=games.filter(g=>g.result&&g.termination!=='error'&&g.termination!=='abort');
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const dist=a=>{const s=a.toSorted((a,b)=>a-b);return{n:s.length,mean:mean(s),p50:s[Math.floor((s.length-1)*.5)],p95:s[Math.floor((s.length-1)*.95)],max:s.at(-1)}};
const engines=[...new Set(games.flatMap(g=>g.engines.map(e=>e.id)))].map(id=>{
 const entries=complete.flatMap(g=>g.engines.flatMap((e,c)=>e.id===id?[g.result.placements.find(p=>p.color===c)]:[]));
 let quiet=0,returns=0,pawns=0,captures=0,moveCount=0;const nodes=[],times=[],depths=[];
 for(const g of games){const prior=new Map();for(const r of g.moves){
  const m=r.move;if(g.engines[r.color].id!==id)continue;
  moveCount++;nodes.push(r.stats.nodes);times.push(r.elapsedMs);depths.push(r.stats.completedDepth);
  if(m.piece.type==='K'&&!m.captured){quiet++;if(prior.get(r.color)===m.to)returns++;prior.set(r.color,m.from);}
  if(m.piece.type==='P')pawns++;if(m.captured)captures++;
 }}
 return{id,completedSeatGames:entries.length,meanRank:mean(entries.map(e=>e.meanRank)),firstPlaceRate:mean(entries.map(e=>+(e.place===1))),
  perSeat:[0,1,2,3].map(c=>({color:c,n:entries.filter(e=>e.color===c).length,meanRank:mean(entries.filter(e=>e.color===c).map(e=>e.meanRank))})),
  moveCount,quietKingMoves:quiet,kingReturns:returns,returnsPerMove:returns/moveCount,pawnMoves:pawns,captures,nodes:dist(nodes),elapsedMs:dist(times),depth:dist(depths)};
});
const observations=JSON.parse(readFileSync(`${dirs[0]}/observations.json`));
const timing=[...new Set(observations.timing.map(t=>t.id))].flatMap(id=>[3,4,5].map(level=>({id,level,elapsed:dist(observations.timing.filter(t=>t.id===id&&t.level===level).map(t=>t.elapsedMs)),fallbacks:observations.timing.filter(t=>t.id===id&&t.level===level&&t.fallback).length})));
const output={games:games.length,completed:complete.length,censored:games.filter(g=>g.termination==='max-ply').length,errors:games.filter(g=>g.termination==='error').length,engines,timing};
writeFileSync(`${dirs[0]}/combined.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
