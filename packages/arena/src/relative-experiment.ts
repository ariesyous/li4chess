import { appendFileSync, writeFileSync } from "node:fs";
import { assertBuildUnchanged, createRunDirectory, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { resolve } from "node:path";
import { evaluateRelativeUtility, loadPosition, positions, searchPosition } from "@li4chess/bot";
import { aggregate, replay, tournament } from "./index.js";
import { experimental } from "./engines.js";
const out=process.argv[2] ?? "arena-results/relative-v1";
createRunDirectory(out);
const engineBuild=readBuildIdentity();
writeFileSync(resolve(out,"run.json"),JSON.stringify({engineBuild,environment:runtimeEnvironment(),seeds:[11,12],maxPlies:240,
  benchBudget:{maxDepth:2,nodeBudget:500}},null,2),{flag:"wx"});
const a=experimental("lab-id-128",{maxDepth:3,nodeBudget:128});
const b=experimental("lab-relative-128",{maxDepth:3,nodeBudget:128,evaluate:evaluateRelativeUtility});
// JSON cannot serialize the callback. Version the evaluator explicitly in evidence.
b.config={maxDepth:3,nodeBudget:128,evaluator:"relative-material-v1"};
const log=resolve(out,"games.jsonl");writeFileSync(log,"",{flag:"wx"});
const games=await tournament([a,a,a,b],[11,12],240,undefined,async g=>{
  await replay(g);appendFileSync(log,JSON.stringify(g)+"\n");console.log(`${g.seed} ${g.termination} ${g.plies}`);
});
writeFileSync(resolve(out,"summary.json"),JSON.stringify(await aggregate(games),null,2));
const bench=positions.map(p=>{
  const state=loadPosition(p);return {id:p.id,base:searchPosition(state,{maxDepth:2,nodeBudget:500}).stats,
    relative:searchPosition(state,{maxDepth:2,nodeBudget:500,evaluate:evaluateRelativeUtility}).stats};
});
assertBuildUnchanged(engineBuild);
writeFileSync(resolve(out,"bench.json"),JSON.stringify(bench,null,2));
