import { describe, expect, it } from "vitest";
import { ALL_COLORS, applyMove, computeDrawResult, computeGameResult, createInitialState, isPlayerInCheck, legalMoves, positionKey } from "@li4chess/engine";
import { chooseWithinDistance, searchMoveId, searchPosition } from "../src/lab-search.js";
import { evaluateUtility, terminalUtility } from "../src/utility.js";
import { loadPosition, perft, positions } from "../src/positions.js";
const position = (id: string) => loadPosition(positions.find(p => p.id === id)!);

describe("experimental search semantics", () => {
  it("enhanced ordering preserves fixed-depth values and bounded quiescence sees a poisoned capture", () => {
    const state=position("poisoned-pawn");
    const material = (s: typeof state,c: number) => s.board.reduce((n,p)=>n+(p ? (p.owner===c ? 1 : -1)*({P:1,N:3,B:3,R:5,Q:9,K:0}[p.type]) : 0),0);
    const plain=searchPosition(state,{maxDepth:1,evaluate:material});
    expect(plain.move.to).toBe(117);
    const q=searchPosition(state,{maxDepth:1,quiescenceDepth:2,evaluate:material,nodeBudget:3000});
    expect(q.stats.depthReached).toBe(1); expect(q.move.to).not.toBe(117); expect(q.stats.qNodes).toBeGreaterThan(0);
    const a=searchPosition(state,{maxDepth:2}),b=searchPosition(state,{maxDepth:2,ordering:"enhanced"});
    expect(a.value).toBeCloseTo(b.value);
  });
  it("separates sole victory and fourth from all nonterminal static values", () => {
    const state = createInitialState();
    for (const color of ALL_COLORS) expect(Math.abs(evaluateUtility(state,color))).toBeLessThan(3);
    const players = { ...state.players, 1: {...state.players[1], status: "checkmated" as const, eliminatedOnTurn:1},
      2: {...state.players[2], status:"checkmated" as const, eliminatedOnTurn:2}, 3: {...state.players[3], status:"checkmated" as const, eliminatedOnTurn:3} };
    const terminal = {...state, players, result:computeGameResult(players)};
    expect(terminalUtility(terminal,0)).toBe(3); expect(terminalUtility(terminal,1)).toBe(-3);
    const draw = {...state, result:computeDrawResult(state.players)};
    expect(terminalUtility(draw,0)).toBe(0);
    expect(evaluateUtility(state,0)).toBeLessThan(evaluateUtility(draw,0));
  });
  it("keeps the last complete iteration, caps nodes and returns a legal zero-budget fallback", () => {
    const state = position("king-endgame");
    const one = searchPosition(state,{maxDepth:1});
    const limited = searchPosition(state,{maxDepth:4,nodeBudget:one.stats.nodes+1});
    expect(limited.stats.depthReached).toBe(1); expect(limited.move).toEqual(one.move);
    expect(limited.stats.nodes).toBeLessThanOrEqual(one.stats.nodes+1);
    const zero = searchPosition(state,{maxDepth:3,nodeBudget:0});
    expect(zero.value).toBeNull(); expect(legalMoves(state)).toContainEqual(zero.move);
    expect(searchPosition(state,{maxDepth:3,cancelled:()=>true}).stopped).toBe("cancelled");
    let clock = 0;
    expect(searchPosition(state,{maxDepth:5,timeMs:2,now:()=>clock++}).stopped).toBe("time");
  });
  it("iterative and direct search agree at fixed depth, with legal PV and exact sampling", () => {
    const state = position("hanging-queen");
    const options = {maxDepth:2,exactRootScores:true};
    const a = searchPosition(state,options), b = searchPosition(state,{...options,iterative:false});
    expect(a.value).toBeCloseTo(b.value); expect(a.move).toEqual(b.move);
    let s = state;
    for (const m of a.pv) { expect(legalMoves(s).map(searchMoveId)).toContain(searchMoveId(m)); s = applyMove(s,m); }
    expect(chooseWithinDistance(a,0,()=>.9)).toEqual(a.move);
  });
  it("recognizes a repetition draw at the horizon and prefers it to a losing static alternative", () => {
    const state = position("king-endgame");
    const move = legalMoves(state)[0]; const key = positionKey(applyMove(state,move));
    const repeated = {...state,positionCounts:{...state.positionCounts,[key]:2}};
    const found = searchPosition(repeated,{maxDepth:1,evaluate:()=>-2});
    expect(found.move).toEqual(move); expect(applyMove(repeated,found.move).result?.reason).toBe("repetition");
    const winning = searchPosition(repeated,{maxDepth:1,evaluate:()=>2.5});
    expect(winning.move).not.toEqual(move);
  });
  it("Maxn and paranoid agree on depth-one own utility", () => {
    const state = position("promotion");
    expect(searchPosition(state,{maxDepth:1,strategy:"maxn"}).move).toEqual(searchPosition(state,{maxDepth:1}).move);
  });
});
describe("position corpus", () => {
  for (const spec of positions) it(spec.id, () => {
    const state = loadPosition(spec);
    if (spec.perft) spec.perft.forEach((count,depth) => expect(perft(state,depth)).toBe(count));
    if (spec.legalProperty) {
      const m = legalMoves(state).find(m => m.from === spec.legalProperty!.from && m.to === spec.legalProperty!.to);
      expect(m?.isCheck).toEqual(expect.arrayContaining(spec.legalProperty.checks));
    }
    if (spec.expect) {
      const result = searchPosition(state,{maxDepth:1});
      expect(result.move).toMatchObject(spec.expect);
      if (spec.winner !== undefined) expect(applyMove(state,result.move).result?.winner).toBe(spec.winner);
    }
    if (spec.id === "king-escape") for (const m of legalMoves(state)) expect(isPlayerInCheck(applyMove(state,m),state.turn)).toBe(false);
  });
});
