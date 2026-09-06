import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, PlayerColor, applyMoveRequest, isPlayerInCheck, legalMoves, resignPlayer, timeoutPlayer, advanceWalkingKing, selectWalkingMove,randomWord,uniformIndex } from "../src/index.js";
import { K,N,P,R,colorAt,kings,play,position,sq } from "./ffa-helpers.js";

const opened = (state: GameState): GameState => ({ ...state, completedMoves:{ 0:3,1:3,2:3,3:3 } });
it("FFA-WALK-04: independent BigInt-derived golden words and rejection of incomplete buckets", () => {
  expect([0,1,2,3].map(index=>randomWord(1,index))).toEqual([1580013426,350525680,3524174333,3011703609]);
  expect(randomWord(0,0)).toBe(1684164658);
  expect(randomWord(0xffffffff,0)).toBe(3950124170);
  const consumed:number[]=[];
  expect(uniformIndex(3,index=>{ consumed.push(index); return index===5 ? 0xffffffff : 2; },5)).toEqual({ index:2,cursor:7 });
  expect(consumed).toEqual([5,6]);
});
for (const rotation of ALL_COLORS) describe(`FFA walking kings: ${PlayerColor[rotation]}`, () => {
  const c = (seat: number) => colorAt(rotation,seat);
  const s = (f: number,r: number) => sq(rotation,f,r);
  const start = (turn = 0) => opened(position(rotation,[...kings,[5,5,R,0],[6,1,P,0]],turn));

  it("FFA-WALK-01: resignation leaves a live King and passive army, losing special rights", () => {
    const before = start();
    const snapshot = JSON.stringify(before);
    const after = resignPlayer(before,rotation);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after.board).toEqual(before.board);
    expect(after.players[rotation]).toMatchObject({ status:"resigned",kingStatus:"walking",score:0,forfeit:{ reason:"resign",sequence:1 } });
    expect(after.castlingRights[rotation]).toEqual({ kingside:false,queenside:false });
    expect(after.turn).toBe(rotation);
    expect(legalMoves(after).every(m => m.piece.type === K && !m.castle)).toBe(true);
    const board = after.board.slice();
    board[s(0,6)] = null;
    board[s(5,8)] = { type:K,owner:c(1),hasMoved:true };
    expect(isPlayerInCheck({ ...before,board },c(1))).toBe(true);
    expect(isPlayerInCheck({ ...after,board },c(1))).toBe(false);
  });

  it("FFA-WALK-02: timeout records its zero clock fact and rejects other facts", () => {
    const before = start();
    const after = timeoutPlayer(before,rotation,{ remainingMs:0 });
    expect(after.players[rotation]).toMatchObject({ status:"timed-out",kingStatus:"walking",forfeit:{ reason:"timeout",sequence:1,clock:{ remainingMs:0 } } });
    expect(after.board).toEqual(before.board);
    for (const remainingMs of [1,-1,NaN,Infinity]) expect(() => timeoutPlayer(before,rotation,{ remainingMs })).toThrow(/clock/);
  });

  it("FFA-WALK-01: dead army capture is zero, and only the forfeiter's EP opportunities expire", () => {
    const base=opened(position(rotation,[...kings,[5,5,R,0],[6,1,P,0],[5,8,R,1],[8,5,P,1]],1));
    const before={ ...base,enPassantRights:[
      { target:s(6,0),pawnSquare:s(6,1),pawnOwner:rotation,eligiblePlayers:[c(1)] },
      { target:s(8,6),pawnSquare:s(8,5),pawnOwner:c(1),eligiblePlayers:[rotation,c(2)] },
    ] };
    const after=resignPlayer(before,rotation);
    expect(after.enPassantRights).toEqual([before.enPassantRights[0],{ ...before.enPassantRights[1],eligiblePlayers:[c(2)] }]);
    const captured=play(after,rotation,[5,8],[5,5]);
    expect(captured.players[c(1)].score).toBe(0);
    expect(captured.awardLedger).toEqual([]);
  });

  it("FFA-WALK-03: out-of-turn resign preserves cadence and only the scheduled King may move", () => {
    let state = resignPlayer(start(1),rotation);
    expect(state.turn).toBe(c(1));
    expect(() => advanceWalkingKing(state)).toThrow(/walking/);
    state = play(state,rotation,[0,6],[0,7]);
    state = play(state,rotation,[6,13],[6,12]);
    state = play(state,rotation,[13,7],[12,7]);
    expect(state.turn).toBe(rotation);
    const move = legalMoves(state)[0];
    expect(() => applyMoveRequest(state,move)).toThrow(/walking/);
    const after = advanceWalkingKing(state);
    expect(after.turn).toBe(c(1));
    expect(after.moveHistory.at(-1)?.piece.type).toBe(K);
  });

  it("FFA-WALK-04: recorded seed, canonical list hash, cursor, move and cause reproduce selection", () => {
    const state = resignPlayer(start(),rotation);
    const selected = selectWalkingMove(state);
    // Independent geometry: (6,1) is occupied by own dead Pawn; four destinations remain.
    const golden=[
      { tos:[6,8,21,22],to:21,hash:"fnv1a64:c40ddcd3da374e64" },
      { tos:[70,71,85,98],to:85,hash:"fnv1a64:166fa21e7b8c06da" },
      { tos:[173,174,187,189],to:187,hash:"fnv1a64:321ea8dbd3e842f6" },
      { tos:[97,110,124,125],to:124,hash:"fnv1a64:d5b05f3260555568" },
    ][rotation];
    expect(legalMoves(state).map(m=>m.to).sort((a,b)=>a-b)).toEqual(golden.tos);
    expect(selected.move.to).toBe(golden.to);
    expect(selected.selection.candidateMovesHash).toBe(golden.hash);
    expect(selected).toEqual(selectWalkingMove(state));
    expect(selected.selection).toMatchObject({ algorithmId:"splitmix32-rejection-v1",seed:"00000001",drawIndex:0 });
    expect(selected.selection.candidateMovesHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(legalMoves(state)).toContainEqual(selected.move);
    const after = advanceWalkingKing(state);
    expect(after.randomActions).toEqual([{ ...selected,actor:rotation,causeSequence:1,sequence:2 }]);
    expect(after.randomDrawIndex).toBe(selected.selection.drawsUsed);
    expect(after.completedMoves[rotation]).toBe(4);
  });

  it("FFA-WALK-05: live King blocks adjacency/capture, legal enemy captures are candidates", () => {
    const before = opened(position(rotation,[[7,0,K,0],[0,6,K,1],[6,13,K,2],[13,7,K,3],[8,1,N,1],[7,3,R,1],[6,0,P,0]]));
    const after = resignPlayer(before,rotation);
    const moves = legalMoves(after);
    expect(moves.some(m => m.to === s(8,1))).toBe(true);
    expect(moves.some(m => m.to === s(7,1) || m.to === s(6,0))).toBe(false);
    const board = after.board.slice();
    board[s(0,6)] = null;
    board[s(7,2)] = { type:K,owner:c(1),hasMoved:true };
    expect(legalMoves({ ...after,board },c(1)).some(m => m.to === s(7,1))).toBe(false);
    expect(legalMoves({ ...after,board },c(1)).some(m => m.to === s(7,0))).toBe(false);
  });

  for (const [id,checked] of [["FFA-WALK-06",true],["FFA-WALK-07",false]] as const) {
    it(`${id}: no legal move resolves at the walking King's scheduled turn`, () => {
      const before = opened(position(rotation,[[3,0,K,0],[0,6,K,1],[8,10,K,2],[13,7,K,3],
        [5,0,N,1],[6,1,N,1],[6,2,N,1], ...(checked ? [[3,3,R,1] as const] : [])],3));
      const resigned = resignPlayer(before,rotation);
      expect(resigned.players[rotation].kingStatus).toBe("walking");
      const after = play(resigned,rotation,[13,7],[12,7]);
      expect(after.players[rotation]).toMatchObject({ status:"resigned",kingStatus:checked ? "checkmated" : "stalemated",forfeit:{ reason:"resign",sequence:1 } });
      expect(after.board[s(3,0)]).toEqual(before.board[s(3,0)]);
      expect(after.turn).toBe(c(1));
      expect(legalMoves(after,rotation)).toEqual([]);
      if (!checked) expect(after.awardLedger.map(a => [a.rule,a.recipient,a.delta])).toEqual(
        ALL_COLORS.filter(color => color !== rotation).map(color => ["walking-stalemate",color,10]));
      else expect(after.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual([["mate",c(1),20]]);
    });
  }

  it("FFA-WALK-08: random actions preserve immutable JSON state and reject nonwalking/terminal input", () => {
    const state = resignPlayer(start(),rotation);
    const saved = JSON.stringify(state);
    expect(advanceWalkingKing(JSON.parse(saved) as GameState)).toEqual(advanceWalkingKing(state));
    expect(JSON.stringify(state)).toBe(saved);
    expect(() => advanceWalkingKing(start())).toThrow(/walking/);
    expect(() => resignPlayer(state,rotation)).toThrow(/active/);
    const terminal={ ...state,result:{ reason:"abort" as const,winner:null,placements:[] } };
    expect(() => advanceWalkingKing(terminal)).toThrow(/walking/);
  });

  it("FFA-WALK-07: already eliminated owners receive no walking stalemate award", () => {
    const base=opened(position(rotation,[[3,0,K,0],[0,6,K,1],[8,10,K,2],[13,7,K,3],
      [5,0,N,1],[6,1,N,1],[6,2,N,1]],3));
    const before={ ...base,players:{ ...base.players,[c(2)]:{ ...base.players[c(2)],status:"checkmated" as const } } };
    const after=play(resignPlayer(before,rotation),rotation,[13,7],[12,7]);
    expect(after.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual(
      ALL_COLORS.filter(color=>color===c(1) || color===c(3)).map(color=>["walking-stalemate",color,10]));
    expect(after.players[c(2)].score).toBe(0);
  });
});
