import { expect,it } from "vitest";
import { createInitialState,computeGameResult,GameState,legalMoves } from "@li4chess/engine";
import { scoreMovesExactly } from "../src/search.js";
import { searchPosition } from "../src/lab-search.js";
import { evaluateFull,WIN_SCORE } from "../src/evaluate.js";
import { terminalUtility } from "../src/utility.js";

it("FFA-END-08: eliminated high scorer wins; tied ranks have equal production/mean-rank utility",()=>{
  const base=createInitialState();
  const players={ ...base.players,0:{ ...base.players[0],status:"resigned" as const,score:50 },
    1:{ ...base.players[1],status:"checkmated" as const,score:20 },2:{ ...base.players[2],status:"stalemated" as const,score:20 },
    3:{ ...base.players[3],score:0 } };
  const state={ ...base,players,result:computeGameResult(players) };
  expect(state.result.winner).toBe(0);
  expect(evaluateFull(state,0)).toBe(WIN_SCORE);
  expect(evaluateFull(state,1)).toBe(evaluateFull(state,2));
  expect(evaluateFull(state,1)).toBeGreaterThan(evaluateFull(state,3));
  expect([0,1,2,3].map(c=>terminalUtility(state,c))).toEqual([3,0,0,-3]);
});

it("search does not force an eligible claim that loses to an eliminated high scorer",()=>{
  const base=createInitialState();
  const state:GameState={ ...base,board:base.board.map(p=>p?.type==="K" || p?.type==="R" ? p : null),players:{ ...base.players,
    1:{ ...base.players[1],score:21 },2:{ ...base.players[2],status:"checkmated",score:50 },3:{ ...base.players[3],status:"checkmated" } } };
  const observed:GameState[]=[];
  const evaluate=(leaf:GameState)=>{ observed.push(leaf);return 0; };
  scoreMovesExactly(state,0,[legalMoves(state)[0]],{ maxDepth:2,evaluate });
  expect(observed.length).toBeGreaterThan(1);
  expect(observed.every(leaf=>leaf.result?.reason!=="claim-win" && leaf.moveHistory.length===2)).toBe(true);
  for(const strategy of ["paranoid","maxn"] as const) {
    observed.length=0;
    const found=searchPosition(state,{ maxDepth:2,iterative:false,strategy,evaluate });
    expect(found.pv).toHaveLength(2);
    expect(observed.some(leaf=>leaf.moveHistory.length===2)).toBe(true);
  }
});
