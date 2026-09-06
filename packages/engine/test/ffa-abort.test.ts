import { describe,expect,it } from "vitest";
import { ALL_COLORS,GameState,PlayerColor,applyMove,createInitialState,legalMoves,resignPlayer,timeoutPlayer } from "../src/index.js";

const withCounts = (counts: readonly number[]): GameState => {
  const base=createInitialState();
  return { ...base,board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null),
    completedMoves:{ 0:counts[0],1:counts[1],2:counts[2],3:counts[3] } };
};
for (const actor of ALL_COLORS) describe(`FFA early abort: ${PlayerColor[actor]}`, () => {
  for (const [id,reason] of [["FFA-ABORT-01","resign"],["FFA-ABORT-02","timeout"]] as const) {
    it(`${id}: any under-three seat aborts, retaining exact result facts without placements`, () => {
      const before = withCounts([2,3,3,3]);
      const after = reason === "resign" ? resignPlayer(before,actor) : timeoutPlayer(before,actor,{ remainingMs:0 });
      expect(after.result).toEqual({ reason:"abort",winner:null,placements:[],abort:{
        classification:reason === "resign" ? "early-resign" : "early-timeout",actor,
        causeSequence:1,completedMoves:before.completedMoves,ratingLiable:actor,...(reason === "timeout" ? { clock:{ remainingMs:0 } } : {}) } });
      expect(after.board).toEqual(before.board);
      expect(after.players).toEqual(before.players);
      expect(after.awardLedger).toEqual([]);
      expect(() => resignPlayer(after,actor)).toThrow(/finished/);
    });
  }
  it("FFA-ABORT-03: all three moves permits resignation", () => {
    const after = resignPlayer(withCounts([3,3,3,3]),actor);
    expect(after.result).toBeNull();
    expect(after.players[actor].kingStatus).toBe("walking");
  });
  it("FFA-ABORT-04: all three moves permits timeout", () => {
    const after = timeoutPlayer(withCounts([3,3,3,3]),actor,{ remainingMs:0 });
    expect(after.result).toBeNull();
    expect(after.players[actor].kingStatus).toBe("walking");
  });
  it("FFA-ABORT-05: uneven counts and zero-move seats abort independent of actor", () => {
    for (const counts of [[7,3,1,5],[3,0,8,3],[0,0,0,0]]) {
      const state = withCounts(counts);
      expect(resignPlayer(state,actor).result?.reason).toBe("abort");
      expect(timeoutPlayer(state,actor,{ remainingMs:0 }).result?.reason).toBe("abort");
    }
  });
});
it("FFA-ABORT-06: real first twelve turns cross the per-seat opening boundary exactly", () => {
  let state = createInitialState();
  expect(state.completedMoves).toEqual({ 0:0,1:0,2:0,3:0 });
  for (let ply=0;ply<12;ply++) {
    const actor=state.turn;
    const before=state;
    const move=legalMoves(state).find(m => !m.captured && !m.isCheck.length)!;
    state=applyMove(state,move);
    for (const color of ALL_COLORS) expect(state.completedMoves[color]).toBe(before.completedMoves[color]+(color===actor ? 1 : 0));
    if (ply === 10) expect(resignPlayer(state,0).result?.reason).toBe("abort");
  }
  expect(state.completedMoves).toEqual({ 0:3,1:3,2:3,3:3 });
  expect(resignPlayer(state,0).result).toBeNull();
});
