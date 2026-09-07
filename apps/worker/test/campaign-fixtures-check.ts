import assert from "node:assert/strict";
import { applyMoveRequest, canClaimWin, claimWin, hasLegalMove, isPlayerInCheck } from "@li4chess/engine";
import { engineState, readReplay, type EngineBuildIdentityV1 } from "@li4chess/protocol";
import { readBuildIdentity } from "@li4chess/protocol/node";
import { fixtureReplay, square, type Scenario } from "./campaign-fixtures.js";
const build={producer:readBuildIdentity()};
for(const scenario of ["claim","mate","stalemate","insufficient","fifty-move","repetition"] as Scenario[]) {
  const replay=await fixtureReplay(scenario,build.producer as EngineBuildIdentityV1);
  let state=engineState((await readReplay(replay)).state);
  const move=(from:readonly[number,number],to:readonly[number,number])=>{
    state=applyMoveRequest(state,{from:square(...from),to:square(...to)});
  };
  if(scenario==="claim") {
    assert.equal(state.turn,1);assert(canClaimWin(state,0));
    assert.equal(claimWin(state,0).result?.reason,"claim-win");
  } else if(scenario==="mate"||scenario==="stalemate") {
    assert(!hasLegalMove(state,0));assert.equal(isPlayerInCheck(state,0),scenario==="mate");
    move([0,6],[0,7]);move([8,10],[9,10]);move([13,7],[12,7]);
    assert.equal(state.players[0].status,scenario==="mate"?"checkmated":"stalemated");assert.equal(state.turn,1);
  } else if(scenario==="repetition") {
    const cycle=[[[7,0],[8,0]],[[0,6],[0,7]],[[6,13],[6,12]],[[13,7],[12,7]],
      [[8,0],[7,0]],[[0,7],[0,6]],[[6,12],[6,13]],[[12,7],[13,7]]] as const;
    for(let i=0;i<16;i++){const [from,to]=cycle[i%8];move(from,to);}
    assert.equal(state.result?.reason,"repetition");
  } else {
    move([7,0],[8,0]);if(scenario==="fifty-move")move([0,6],[0,7]);
    assert.equal(state.result?.reason,scenario==="insufficient"?"insufficient-material":"fifty-move");
  }
  console.log(`fixture preconditions passed: ${scenario}`);
}
