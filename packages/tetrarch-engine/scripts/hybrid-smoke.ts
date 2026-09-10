import { strict as assert } from "node:assert";
import { createInitialState, legalMoves } from "@li4chess/engine";
import { chooseHybrid } from "../src/hybrid.js";
import { NodeAdvisoryClient } from "../src/node.js";

const client=new NodeAdvisoryClient(),state=createInitialState(),budget={nodeBudget:20_000,maxDepth:32};
const native=()=>({move:legalMoves(state)[0]});
try {
  const first=await chooseHybrid(state,client,native,budget);
  assert.equal(first.stats.fallback,false,JSON.stringify(first.stats));
  const second=await chooseHybrid(state,client,native,budget);
  assert.equal(second.stats.fallback,false,JSON.stringify(second.stats));
  assert.deepEqual(first.move,second.move);
  assert.equal(first.stats.external?.nodes,second.stats.external?.nodes);
  assert.equal(first.stats.external?.depth,second.stats.external?.depth);
  const abort=new AbortController();
  const running=chooseHybrid(state,client,native,{nodeBudget:100_000_000,maxDepth:32},abort.signal);
  const cancelled=assert.rejects(running,{name:"AbortError"});
  setTimeout(()=>abort.abort(),50);
  await cancelled;
  const recovered=await chooseHybrid(state,client,native,budget);
  assert.equal(recovered.stats.fallback,false,JSON.stringify(recovered.stats));
  assert.deepEqual(first.move,recovered.move);
  console.log(JSON.stringify({passed:true,checks:["actual NNUE/WASM worker","canonical move","deterministic node search","in-flight cancellation","worker replacement recovery"],first:first.stats,recovered:recovered.stats},null,2));
} finally {client.close();}
