import { expect, it } from "vitest";
import { applyMove, createInitialState, legalMoves } from "@li4chess/engine";
import { positionHash, searchSignature, TranspositionTable, updatePositionHash } from "../src/hash.js";
import { loadPosition, positions } from "../src/positions.js";
import { searchPosition } from "../src/lab-search.js";

it("delta hashes match full recomputation over legal paths and tactical transitions", () => {
  for (const spec of positions) {
    let state = loadPosition(spec); let hash = positionHash(state);
    for (let ply=0;ply<8 && !state.result;ply++) {
      const moves=legalMoves(state); const child=applyMove(state,moves[(ply*7)%moves.length]);
      hash=updatePositionHash(hash,state,child); expect(hash).toBe(positionHash(child)); state=child;
    }
  }
});
it("separates histories, scores, moved flags, statuses and rejects collisions", () => {
  const state=createInitialState(); const hash=positionHash(state);
  const changes=[{...state,turn:1 as const},{...state,positionCounts:{}},{...state,enPassantTarget:20},
    {...state,players:{...state.players,0:{...state.players[0],score:1}}},
    {...state,board:state.board.map((p,i)=>i===3 && p ? {...p,hasMoved:true}:p)}];
  for (const changed of changes) expect(positionHash(changed)).not.toBe(hash);
  const tt=new TranspositionTable(1);
  tt.set(hash,{signature:searchSignature(state),depth:1,value:3,bound:"exact"});
  expect(tt.get(hash,"different")).toBeUndefined();
  tt.set(1n,{signature:"second",depth:1,value:1,bound:"upper"});
  expect(tt.get(hash,searchSignature(state))).toBeUndefined();
});
it("TT preserves fixed-depth values", () => {
  const state=loadPosition(positions.find(p=>p.id==="king-endgame")!);
  const a=searchPosition(state,{maxDepth:3}),b=searchPosition(state,{maxDepth:3,ttCapacity:1000});
  expect(a.value).toBe(b.value); expect(a.move).toEqual(b.move);
});
