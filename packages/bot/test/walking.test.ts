import { expect,it } from "vitest";
import { createInitialState,GameState,legalMoves,resignPlayer,applyMove,advanceWalkingKing } from "@li4chess/engine";
import { scoreMovesExactly } from "../src/search.js";
import { searchPosition } from "../src/lab-search.js";

it("production and laboratory descendants use the recorded random King action and advance its cursor",()=>{
  const base=createInitialState();
  // Keep a Red Pawn so the automatic bare-King draw does not preempt walking.
  const state=resignPlayer({ ...base,board:base.board.map((p,square)=>p?.type === "K" || square===20 ? p : null),
    castlingRights:{ 0:{ kingside:false,queenside:false },1:{ kingside:false,queenside:false },2:{ kingside:false,queenside:false },3:{ kingside:false,queenside:false } },
    completedMoves:{ 0:3,1:3,2:3,3:3 } },1);
  const roots=legalMoves(state);
  const expected=roots.map(move=>advanceWalkingKing(applyMove(state,move)));
  const observed:GameState[]=[];
  const evaluate=(leaf:GameState)=>{ observed.push(leaf);return 0; };
  scoreMovesExactly(state,0,roots,{ maxDepth:2,evaluate });
  expect(observed).toHaveLength(roots.length);
  for(const leaf of observed) expect(expected).toContainEqual(leaf);
  for(const strategy of ["paranoid","maxn"] as const) {
    observed.length=0;
    searchPosition(state,{ maxDepth:2,iterative:false,strategy,evaluate,exactRootScores:true });
    expect(observed.length).toBeGreaterThan(0);
    for(const leaf of observed) expect(expected).toContainEqual(leaf);
  }
});
