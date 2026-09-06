import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, PieceType, PlayerColor, applyMoveRequest, legalMoves, positionKey, squareOf } from "../src/index.js";
import { K, N, P, Q, R, colorAt, kings, play, position, sq } from "./ffa-helpers.js";

// Accepted contract oracle: eighth rank is local index 7, not the far edge.
// Absolute from/to coordinates are independent of the transform under test.
const coordinates = [ [[5,6],[5,7]], [[6,8],[7,8]], [[8,7],[8,6]], [[7,5],[6,5]] ] as const;
for (const rotation of ALL_COLORS) describe(`FFA promotion: ${PlayerColor[rotation]}`, () => {
  const s = (f: number, r: number) => sq(rotation, f, r);
  const c = (offset: number) => colorAt(rotation, offset);
  const pending = () => position(rotation, [...kings, [5,6,P,0]]);

  it("FFA-PROMO-01: eighth-rank quiet move has one automatic Queen outcome at the absolute square", () => {
    const state = pending();
    const [from, to] = coordinates[rotation].map(([f,r]) => squareOf(f,r));
    expect(s(5,6)).toBe(from);
    expect(s(5,7)).toBe(to);
    const moves = legalMoves(state).filter(m => m.from === from);
    expect(moves.map(m => [m.to,m.promotion])).toEqual([[to,Q]]);
    const after = play(state, rotation, [5,6], [5,7]);
    expect(after.board[to]).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
    expect(after.board[from]).toBeNull();
    expect(after.players).toEqual(state.players);
    expect(after.moveHistory.at(-1)?.promotion).toBe(Q);
  });

  it("FFA-PROMO-02: either diagonal capture promotes and scores the captured native piece", () => {
    for (const file of [4,6]) {
      const state = position(rotation, [...kings, [5,6,P,0], [file,7,N,1]]);
      const after = play(state, rotation, [5,6], [file,7]);
      expect(after.board[s(file,7)]).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
      // On (6,7) the new Queen checks Yellow on file 6 and Green on rank 7.
      expect(after.players[rotation].score).toBe(file === 6 ? 4 : 3);
      expect(after.awardLedger.filter(a => a.rule === "capture").map(a => a.delta)).toEqual([3]);
      expect(after.awardLedger.filter(a => a.rule === "multi-check").map(a => a.delta)).toEqual(file === 6 ? [1] : []);
      expect(after.moveHistory.at(-1)?.captured?.type).toBe(N);
    }
  });

  it("FFA-PROMO-03: ranks before/after eight and the historical far edge do not promote", () => {
    for (const rank of [5,7,12]) {
      const state = position(rotation, [...kings, [5,rank,P,0]]);
      const after = play(state, rotation, [5,rank], [5,rank+1]);
      expect(after.board[s(5,rank+1)]).toEqual({ owner:rotation, type:P, hasMoved:true });
      expect(after.moveHistory.at(-1)?.promotion).toBeUndefined();
    }
  });

  it("FFA-PROMO-04: omitted choice is automatic; reject underpromotion and spare King requests", () => {
    const state = pending();
    const request = { from:s(5,6), to:s(5,7) };
    const before = JSON.stringify(state);
    expect(applyMoveRequest(state, request)).toEqual(applyMoveRequest(state, { ...request, promotion:Q }));
    for (const promotion of [P,N,PieceType.Bishop,R,K]) {
      expect(() => applyMoveRequest(state, { ...request, promotion })).toThrow(/legal move/);
    }
    expect(JSON.stringify(state)).toBe(before);
    expect(applyMoveRequest(state, request).board.filter(p => p?.type === K)).toHaveLength(4);
  });

  it("FFA-PROMO-05: actual promoted Queen is worth one on capture, native Queen nine, dead Queen zero", () => {
    const start = position(rotation, [...kings, [5,6,P,0], [4,9,N,1]]);
    const promoted = play(start, rotation, [5,6], [5,7]);
    const captured = play(promoted, rotation, [4,9], [5,7]);
    expect(captured.players[c(1)].score).toBe(1);
    expect(captured.moveHistory.at(-1)?.captured).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
    const native = position(rotation, [...kings, [5,7,Q,0], [4,9,N,1]], 1);
    expect(play(native, rotation, [4,9], [5,7]).players[c(1)].score).toBe(9);
    const dead: GameState = { ...promoted, players:{ ...promoted.players, [rotation]:{ ...promoted.players[rotation], status:"checkmated" } } };
    expect(play(dead, rotation, [4,9], [5,7]).players[c(1)].score).toBe(0);
  });

  it("FFA-PROMO-06: provenance survives subsequent Queen movement, JSON, and repetition identity", () => {
    let state = play(pending(), rotation, [5,6], [5,7]);
    state = play(state, rotation, [0,6], [0,5]);
    state = play(state, rotation, [6,13], [6,12]);
    state = play(state, rotation, [13,7], [12,8]);
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    const after = play(state, rotation, [5,7], [8,10]);
    expect(play(restored, rotation, [5,7], [8,10])).toEqual(after);
    expect(after.board[s(8,10)]).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
    const board = after.board.slice();
    board[s(8,10)] = { owner:rotation, type:Q, hasMoved:true };
    expect(positionKey(after)).not.toBe(positionKey({ ...after, board }));
  });

  it("FFA-PROMO-07: one-point Queen retains Queen movement and check classification", () => {
    const state = play(pending(), rotation, [5,6], [5,7]);
    const moves = legalMoves({ ...state, turn:rotation }).filter(m => m.from === s(5,7));
    for (const [file,rank] of [[5,9],[7,7],[7,9]] as const) expect(moves.some(m => m.to === s(file,rank))).toBe(true);
    expect(moves.every(m => m.piece.type === Q)).toBe(true);
    expect(moves.some(m => m.isCheck.length > 0)).toBe(true);
    // Exact Queen-tier multi-check awards belong to the following SCORE ledger slice.
  });

  it("FFA-PROMO-08: promotion obeys king safety; dead capture still promotes for zero", () => {
    const pinned = position(rotation, [[5,0,K,0], ...kings.slice(1), [5,6,P,0], [5,9,R,1], [6,7,N,1]]);
    expect(() => applyMoveRequest(pinned, { from:s(5,6), to:s(6,7) })).toThrow(/legal move/);
    const live = position(rotation, [...kings, [5,6,P,0], [6,7,N,1]]);
    const dead: GameState = { ...live, players:{ ...live.players, [c(1)]:{ ...live.players[c(1)], status:"checkmated" } } };
    const after = play(dead, rotation, [5,6], [6,7]);
    expect(after.players[rotation].score).toBe(1); // Queen checks Yellow and Green; dead capture itself is zero.
    expect(after.awardLedger.map(a => [a.rule,a.delta])).toEqual([["multi-check",1]]);
    expect(after.board[s(6,7)]).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
  });

  it("FFA-PROMO-08 / EP: an adjacent double push permits eighth-rank EP promotion, live or dead", () => {
    // Written before the EP promotion fix: skipped square (2,7), victim (3,7).
    for (const dead of [false,true]) {
      let state = position(rotation, [...kings, [3,6,P,0], [1,7,P,1,false]], 1);
      state = play(state, rotation, [1,7], [3,7]);
      if (dead) state = { ...state, players:{ ...state.players, [c(1)]:{ ...state.players[c(1)], status:"checkmated" } } };
      state = play(state, rotation, [6,13], [6,12]);
      state = play(state, rotation, [13,7], [12,7]);
      const after = play(state, rotation, [3,6], [2,7]);
      expect(after.board[s(2,7)]).toEqual({ owner:rotation, type:Q, hasMoved:true, promotedFrom:P });
      expect(after.board[s(3,7)]).toBeNull();
      expect(after.players[rotation].score).toBe(dead ? 0 : 1);
      expect(after.moveHistory.at(-1)?.enPassantCapture).toBe(s(3,7));
      expect(after.moveHistory.at(-1)?.promotion).toBe(Q);
      expect(after.enPassantRights).toEqual([]);
    }
  });
});
