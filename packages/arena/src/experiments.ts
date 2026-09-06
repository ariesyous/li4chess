import { appendFileSync, writeFileSync } from "node:fs";
import { assertBuildUnchanged, createRunDirectory, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { resolve } from "node:path";
import { ALL_COLORS, GameState, PieceType, applyMove, createInitialState, legalMoves, localSquare, positionKey } from "@li4chess/engine";
import { LabOptions, loadPosition, positions, searchPosition } from "@li4chess/bot";
import { aggregate, replay, seededRandom, tournament } from "./index.js";
import { classic, experimental } from "./engines.js";

export const variants: { id: string; config: LabOptions }[] = [
  {id:"lab-fixed",config:{maxDepth:2,iterative:false}},
  {id:"lab-id",config:{maxDepth:2}},
  {id:"lab-tt",config:{maxDepth:2,ttCapacity:2000}},
  {id:"lab-order",config:{maxDepth:2,ttCapacity:2000,ordering:"enhanced"}},
  {id:"lab-q",config:{maxDepth:2,ttCapacity:2000,ordering:"enhanced",quiescenceDepth:2}},
  {id:"lab-maxn",config:{maxDepth:2,strategy:"maxn",ordering:"enhanced"}},
];
function sparseStart(): GameState {
  const base=createInitialState(); const board=base.board.map(()=>null) as (GameState["board"][number])[];
  for (const c of ALL_COLORS) {
    board[localSquare(c,4,0)]={type:PieceType.King,owner:c,hasMoved:true};
    board[localSquare(c,1,3)]={type:PieceType.Rook,owner:c,hasMoved:true};
    board[localSquare(c,0,6)]={type:PieceType.Pawn,owner:c,hasMoved:true};
  }
  const rights={...base.castlingRights}; for (const c of ALL_COLORS) rights[c]={kingside:false,queenside:false};
  const s={...base,board,castlingRights:rights}; return {...s,positionCounts:{[positionKey(s)]:1}};
}
const [out="arena-results/ablations", mode="sparse", seedCount="2", cap="160"] = process.argv.slice(2);
if (!Number.isInteger(+seedCount) || +seedCount<1 || !["sparse","opening","bench"].includes(mode)) throw new Error("Invalid experiment arguments");
createRunDirectory(out);
const engineBuild=readBuildIdentity();
writeFileSync(resolve(out,"manifest.json"),JSON.stringify({date:new Date().toISOString(),mode,seedCount:+seedCount,cap:+cap,
  engineBuild,environment:runtimeEnvironment(),setup:"sparse-promotion-rank6-v2 or Modern opening checkpoint",variants,
  benchBudget:{maxDepth:3,nodeBudget:500},gameNodeBudget:64},null,2),{flag:"wx"});
const bench=[];
for (const spec of positions) for (const variant of variants) {
  const result=searchPosition(loadPosition(spec),{...variant.config,maxDepth:3,nodeBudget:500});
  bench.push({position:spec.id,variant:variant.id,move:result.move,value:result.value,stats:result.stats,stopped:result.stopped});
}
assertBuildUnchanged(engineBuild);
writeFileSync(resolve(out,"ablation-bench.json"),JSON.stringify(bench,null,2));
if (mode!=="bench") {
  // One-variable comparisons; Maxn compares against matching ordering without TT/Q.
  const pairs=[
    [classic(1),experimental("lab-id",{maxDepth:2,nodeBudget:64})],
    ...[[0,1],[1,2],[2,3],[3,4]].map(([a,b])=>[experimental(variants[a].id,{...variants[a].config,nodeBudget:64}),experimental(variants[b].id,{...variants[b].config,nodeBudget:64})]),
    [experimental("lab-paranoid-order",{maxDepth:2,ordering:"enhanced",nodeBudget:64}),experimental("lab-maxn",{maxDepth:2,ordering:"enhanced",strategy:"maxn",nodeBudget:64})],
  ];
  const reports=[];
  for (let p=0;p<pairs.length;p++) {
    const [a,b]=pairs[p]; const log=resolve(out,`EXP-${p+1}.jsonl`); writeFileSync(log,"",{flag:"wx"});
    const all=[];
    for (let seed=1;seed<=+seedCount;seed++) {
      let initial=mode==="sparse" ? sparseStart() : createInitialState();
      const random=seededRandom(seed);
      // Paired seeded opening jitter gives different histories; same start for all rotations.
      for (let ply=0;ply<4 && !initial.result;ply++) {const moves=legalMoves(initial);initial=applyMove(initial,moves[Math.floor(random()*moves.length)]);}
      const games=await tournament([a,a,a,b],[seed],+cap,initial,async g=>{
        await replay(g); appendFileSync(log,JSON.stringify(g)+"\n");
        console.log(`EXP-${p+1} seed=${seed} ${g.termination} plies=${g.plies} winner=${g.result?.winner ?? "-"}`);
      });
      all.push(...games);
    }
    reports.push({id:`EXP-${p+1}`,a:a.id,b:b.id,report:await aggregate(all)});
    writeFileSync(resolve(out,"reports.json"),JSON.stringify(reports,null,2));
  }
}
