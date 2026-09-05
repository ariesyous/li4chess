import { cpus, platform, arch, totalmem } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyMove, legalMoves, positionKey, applyMoveToBoard, isPlayerInCheck } from "@li4chess/engine";
import { evaluateFull, loadPosition, positions, searchPosition, chooseClassicMove } from "@li4chess/bot";
import { distribution } from "./index.js";

const out = process.argv[2] ?? "arena-results/bench";
mkdirSync(out,{recursive:true});
const repeats = 5;
const rows = positions.map(spec => {
  const state = loadPosition(spec); const moves = legalMoves(state);
  const measure = (fn:()=>unknown) => { fn(); return distribution(Array.from({length:repeats},()=>{ const start=performance.now(); fn(); return performance.now()-start; })); };
  const search = Array.from({length:3},()=>searchPosition(state,{maxDepth:3,nodeBudget:300,timeMs:500}));
  return {id:spec.id,branching:moves.length, legalMs:measure(()=>legalMoves(state)),
    applyMs:measure(()=>applyMove(state,moves[0])), boardOnlyMs:measure(()=>applyMoveToBoard(state.board,moves[0])),
    cloneMs:measure(()=>structuredClone(state)), repetitionMs:measure(()=>positionKey(state)),
    checkMs:measure(()=>isPlayerInCheck(state,state.turn)), evalMs:measure(()=>evaluateFull(state,state.turn)),
    classicLevel1Ms:measure(()=>chooseClassicMove(state,state.turn,1,()=>1)),
    searches:search.map(s=>s.stats), memoryBytes:process.memoryUsage() };
});
const report = {date:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemory:totalmem()},repeats,rows};
writeFileSync(resolve(out,"benchmark.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
