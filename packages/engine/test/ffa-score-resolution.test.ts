import { describe,expect,it } from "vitest";
import { ALL_COLORS,PlayerColor,resignPlayer } from "../src/index.js";
import { K,N,P,R,B,Q,kings,position,play,colorAt } from "./ffa-helpers.js";

for (const rotation of ALL_COLORS) describe(`FFA score resolution: ${PlayerColor[rotation]}`,()=>{
  const c=(seat:number)=>colorAt(rotation,seat);
  const trap=[[3,0,K,0],[0,6,K,1],[8,10,K,2],[13,7,K,3],[5,0,N,1],[6,1,N,1],[6,2,N,1]] as const;
  it("FFA-SCORE-03: only the checking owner gets mate credit, at scheduled resolution",()=>{
    let state=position(rotation,[...trap,[3,3,R,1]],1);
    state=play(state,rotation,[0,6],[0,7]);
    state=play(state,rotation,[8,10],[9,10]);
    expect(ALL_COLORS.map(color=>state.players[color].score)).toEqual([0,0,0,0]);
    state=play(state,rotation,[13,7],[12,7]);
    expect(state.players[rotation].status).toBe("checkmated");
    expect(state.awardLedger.map(a=>[a.rule,a.recipient,a.delta,a.causeSequence])).toEqual([["mate",c(1),20,3]]);
    expect(state.players[c(3)].score).toBe(0);
  });
  it("FFA-SCORE-04: two or three checking owners split exactly twenty equally",()=>{
    for (const count of [2,3]) {
      const before=position(rotation,[...trap,[3,3,R,1],[4,0,R,2],...(count===3 ? [[5,2,B,3] as const] : [])],3);
      const after=play(before,rotation,[13,7],[12,7]);
      const expected=ALL_COLORS.filter(color=>color!==rotation && (count===3 || color!==c(3)));
      expect(after.awardLedger.map(a=>[a.rule,a.recipient,a.delta,a.total])).toEqual(expected.map(color=>["mate",color,20/count,20/count]));
    }
  });
  it("FFA-SCORE-05: own last movable Pawn self-blocks, quiet rotation retains cause and awards only victim",()=>{
    let state=position(rotation,[...trap,[7,5,P,0],[7,7,N,1]]);
    state=play(state,rotation,[7,5],[7,6]);
    expect(state.players[rotation].noMoveCause).toEqual({ actor:rotation,sequence:1 });
    state=play(state,rotation,[0,6],[0,7]);
    state=play(state,rotation,[8,10],[9,10]);
    state=play(state,rotation,[13,7],[12,7]);
    expect(state.players[rotation].status).toBe("stalemated");
    expect(state.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual([["self-stalemate",rotation,20]]);
  });
  it("FFA-SCORE-06: rescue clears self cause; an opponent re-block makes all survivors recipients",()=>{
    let state=position(rotation,[...trap,[7,5,P,0],[7,7,N,1],[5,8,N,2]]);
    state=play(state,rotation,[7,5],[7,6]);
    state=play(state,rotation,[7,7],[9,6]);
    expect(state.players[rotation].noMoveCause).toBeUndefined();
    state=play(state,rotation,[5,8],[7,7]);
    expect(state.players[rotation].noMoveCause).toEqual({ actor:c(2),sequence:3 });
    state=play(state,rotation,[13,7],[12,7]);
    expect(state.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual(ALL_COLORS.filter(color=>color!==rotation).map(color=>["opponent-stalemate",color,10]));
    expect(state.players[rotation].score).toBe(0);
  });
  it("FFA-SCORE-04 / WALK-01: a resigned checker loses all mate credit before resolution",()=>{
    const base=position(rotation,[[3,0,K,0],[0,6,K,1],[8,10,K,2],[13,7,K,3],
      [5,0,N,2],[6,1,N,2],[6,2,N,2],[3,3,R,1],[4,0,R,2]],3);
    const resigned=resignPlayer({ ...base,completedMoves:{ 0:3,1:3,2:3,3:3 } },c(1));
    const after=play(resigned,rotation,[13,7],[12,7]);
    expect(after.players[rotation].status).toBe("checkmated");
    expect(after.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual([["mate",c(2),20]]);
  });
});
