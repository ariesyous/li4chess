import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, PieceType, PlayerColor, legalMoves } from "../src/index.js";
import { B, K, N, P, Q, R, colorAt, kings, play, position, sq } from "./ffa-helpers.js";

// Expected amounts and inputs were written first in docs/m1-score-acceptance.md.
for (const rotation of ALL_COLORS) describe(`FFA scoring: ${PlayerColor[rotation]}`, () => {
  const c = (seat: number) => colorAt(rotation, seat);
  const s = (f: number,r: number) => sq(rotation,f,r);
  const checkPosition = (triple = false, type: PieceType = Q) => position(rotation,
    [[7,0,K,0], [3,6,K,1], [6,10,K,2], ...(triple ? [[10,6,K,3] as const] : [[12,8,K,3] as const]), [4,4,type,0]]);
  const deltas = (state: GameState) => state.awardLedger.map(a => [a.rule,a.recipient,a.delta,a.total]);

  it("FFA-SCORE-01: accepted live capture values and immutable ledger", () => {
    for (const [type,value] of [[P,1],[N,3],[B,5],[R,5],[Q,9]] as const) {
      const before = position(rotation, [...kings, [5,5,R,0], [5,8,type,1]]);
      const after = play(before, rotation, [5,5], [5,8]);
      expect(after.players[rotation].score).toBe(value);
      expect(after.awardLedger).toEqual([{ sequence:2, causeSequence:1, rule:"capture", recipient:rotation, delta:value, total:value }]);
      expect(before.awardLedger).toEqual([]);
    }
  });

  it("FFA-SCORE-02: passive pieces produce neither points nor award entries", () => {
    for (const status of ["checkmated","stalemated","resigned"] as const) for (const type of [P,N,B,R,Q,K]) {
      const before = position(rotation, [...kings.filter(([, , , owner]) => type !== K || owner !== 1), [5,5,R,0], [5,8,type,1]]);
      const dead = { ...before, players:{ ...before.players, [c(1)]:{ ...before.players[c(1)], status } } };
      const after = play(dead, rotation, [5,5], [5,8]);
      expect(after.players[rotation].score).toBe(0);
      expect(after.awardLedger).toEqual([]);
    }
  });

  for (const [id,triple,delta] of [["FFA-SCORE-07",false,1],["FFA-SCORE-08",true,5]] as const) {
    it(`${id}: Queen newly checks multiple kings`, () => {
      const after = play(checkPosition(triple), rotation, [4,4], [6,6]);
      expect(deltas(after)).toEqual([["multi-check",rotation,delta,delta]]);
    });
  }

  it("FFA-SCORE-09: Knight newly checks two kings for five points", () => {
    const before = position(rotation, [[7,0,K,0],[3,4,K,1],[7,6,K,2],[12,8,K,3],[6,3,N,0]]);
    expect(deltas(play(before, rotation, [6,3], [5,5]))).toEqual([["multi-check",rotation,5,5]]);
  });

  it("FFA-SCORE-10: Rook newly checks three kings for twenty points", () => {
    const before = position(rotation, [[7,0,K,0],[3,6,K,1],[6,10,K,2],[10,6,K,3],[6,4,R,0],[6,6,N,1]]);
    expect(deltas(play(before, rotation, [6,4], [6,6]))).toEqual([["capture",rotation,3,3],["multi-check",rotation,20,23]]);
  });

  it("FFA-SCORE-11 / PROMO-07: pawn-Queens use the Queen schedule", () => {
    for (const [triple,delta] of [[false,1],[true,5]] as const) {
      const before = checkPosition(triple);
      const board = before.board.slice();
      board[s(4,4)] = { ...board[s(4,4)]!, promotedFrom:P };
      expect(deltas(play({ ...before, board }, rotation, [4,4], [6,6]))).toEqual([["multi-check",rotation,delta,delta]]);
    }
    // Actual quiet promotion at (5,7), newly checking both Kings on that rank.
    const before = position(rotation, [[7,0,K,0],[0,7,K,1],[10,7,K,2],[13,9,K,3],[5,6,P,0]]);
    const after = play(before, rotation, [5,6], [5,7]);
    expect(after.board[s(5,7)]?.promotedFrom).toBe(P);
    expect(deltas(after)).toEqual([["multi-check",rotation,1,1]]);
  });

  it("FFA-SCORE-12: pre-existing checks and inactive kings never inflate a bonus", () => {
    for (const owner of [0,2] as const) {
      const before = checkPosition();
      const board = before.board.slice();
      board[s(3,9)] = { type:R, owner:c(owner), hasMoved:true };
      expect(deltas(play({ ...before, board }, rotation, [4,4], [6,6]))).toEqual([]);
    }
    const before = checkPosition();
    const dead = { ...before, players:{ ...before.players, [c(1)]:{ ...before.players[c(1)], status:"checkmated" as const } } };
    expect(deltas(play(dead, rotation, [4,4], [6,6]))).toEqual([]);
  });

  for (const [id,type,delta] of [["FFA-SCORE-13",R,5],["FFA-SCORE-14",Q,1]] as const) {
    it(`${id}: discovered checks count and any newly checking Queen chooses the lower tier`, () => {
      const before = position(rotation, [[7,0,K,0],[6,10,K,1],[10,6,K,2],[13,3,K,3],[6,4,type,0],[6,6,N,0]]);
      expect(deltas(play(before, rotation, [6,6], [8,7]))).toEqual([["multi-check",rotation,delta,delta]]);
    });
  }

  it("FFA-SCORE-14: a continuing Queen check cannot downgrade two new non-Queen checks", () => {
    const before = position(rotation, [[7,0,K,0],[6,10,K,1],[10,6,K,2],[13,3,K,3],
      [6,4,R,0],[6,6,N,0],[13,5,Q,0]]);
    expect(deltas(play(before, rotation, [6,6], [8,7]))).toEqual([["multi-check",rotation,5,5]]);
  });

  it("FFA-SCORE-15: capture and multi-check stack in exact order with resulting totals", () => {
    const before = checkPosition();
    const board = before.board.slice();
    board[s(6,6)] = { type:N, owner:c(1), hasMoved:true };
    const after = play({ ...before, board }, rotation, [4,4], [6,6]);
    expect(after.awardLedger).toEqual([
      { sequence:2,causeSequence:1,rule:"capture",recipient:rotation,delta:3,total:3 },
      { sequence:3,causeSequence:1,rule:"multi-check",recipient:rotation,delta:1,total:4 },
    ]);
    expect(after.eventSequence).toBe(3);
  });

  it("FFA-SCORE-16: subsequent moves retain immutable ordered ledger and JSON reproduction", () => {
    const before = position(rotation, [...kings, [5,5,R,0], [5,8,N,1]]);
    const captured = play(before, rotation, [5,5], [5,8]);
    const after = play(captured, rotation, [0,6], [0,5]);
    expect(after.awardLedger).toEqual(captured.awardLedger);
    expect(after.eventSequence).toBe(3);
    expect(play(JSON.parse(JSON.stringify(captured)) as GameState, rotation, [0,6], [0,5])).toEqual(after);
    expect(legalMoves(after).length).toBeGreaterThan(0);
  });
});
