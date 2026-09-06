import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, PlayerColor, applyMoveRequest, castlingMoves, hasLegalMove, isPlayerInCheck, legalMoves, pseudoLegalMoves } from "../src/index.js";
import { B, K, N, P, Q, R, Placement, colorAt, kings, play, position, sq } from "./ffa-helpers.js";

const statuses = ["checkmated", "stalemated"] as const;
type DeadStatus = typeof statuses[number];
// CORE-08/10's king trap, plus a completely immobile army in the top-left
// wing. The five pawns block one another/the edge; every non-pawn is boxed in.
const cage: readonly Placement[] = [
  [3,11,P,0], [4,11,P,0], [5,11,P,0], [3,12,Q,0], [4,12,B,0],
  [5,12,P,0], [3,13,N,0], [4,13,R,0], [5,13,P,0],
];
const trap: readonly Placement[] = [
  [3,0,K,0], [0,6,K,1], [8,10,K,2], [13,7,K,3],
  [5,0,N,1], [6,1,N,1], [6,2,N,1], ...cage,
];

for (const rotation of ALL_COLORS) describe(`FFA dead armies: ${PlayerColor[rotation]}`, () => {
  const s = (f: number, r: number) => sq(rotation, f, r);
  const c = (offset: number) => colorAt(rotation, offset);
  const pending = (status: DeadStatus, turn = 3, extra: readonly Placement[] = []) =>
    position(rotation, [...trap, ...(status === "checkmated" ? [[3,3,R,1] as const] : []), ...extra], turn);
  const passive = (state: GameState, owner: PlayerColor, status: DeadStatus): GameState =>
    ({ ...state, players: { ...state.players, [owner]: { ...state.players[owner], status, eliminatedOnTurn: 0 } } });
  const assertImmobile = (state: GameState, owner = rotation) => {
    expect(legalMoves(state, owner)).toEqual([]);
    expect(pseudoLegalMoves(state, owner)).toEqual([]);
    expect(hasLegalMove(state, owner)).toBe(false);
    expect(castlingMoves(state, owner)).toEqual([]);
  };

  for (const [id, status] of [["FFA-DEAD-01", "checkmated"], ["FFA-DEAD-02", "stalemated"]] as const) {
    it(`${id}: deferred resolution retains the exact whole army and skips its turns`, () => {
      let state = pending(status, 1);
      expect(isPlayerInCheck(state, rotation)).toBe(status === "checkmated");
      expect(hasLegalMove(state, rotation)).toBe(false);
      const before = state;
      state = play(state, rotation, [0,6], [0,7]);
      state = play(state, rotation, [8,10], [9,10]);
      expect(state.players[rotation].status).toBe("active");
      state = play(state, rotation, [13,7], [12,7]);
      const expectedBoard = before.board.slice();
      for (const [from, to] of [[[0,6],[0,7]], [[8,10],[9,10]], [[13,7],[12,7]]] as const) {
        expectedBoard[s(to[0], to[1])] = expectedBoard[s(from[0], from[1])];
        expectedBoard[s(from[0], from[1])] = null;
      }
      expect(state.board).toEqual(expectedBoard);
      expect(state.players[rotation]).toEqual({ ...before.players[rotation], status, eliminatedOnTurn: 4 });
      expect(state.turn).toBe(c(1));
      expect(state.result).toBeNull();
      expect(state.moveHistory.at(-1)!.eliminates).toEqual(status === "checkmated" ? [rotation] : []);
      assertImmobile(state);
      // Clearing the stalemate cage's escapes later must not reactivate it.
      state = play(state, rotation, [6,2], [8,3]);
      state = play(state, rotation, [9,10], [8,10]);
      state = play(state, rotation, [12,7], [13,7]);
      expect(state.turn).toBe(c(1));
      expect(state.players[rotation].status).toBe(status);
      expect(state.board.filter(p => p?.owner === rotation)).toEqual(before.board.filter(p => p?.owner === rotation));
      assertImmobile(state);
    });
  }

  it("FFA-DEAD-03: every passive piece including the king is capturable for zero points", () => {
    for (const status of statuses) for (const type of [P,N,B,R,Q,K]) for (const owner of [1,2,3]) {
      const liveKings = kings.filter(([, , , seat]) => type !== K || seat !== owner);
      let state = passive(position(rotation, [...liveKings, [5,5,R,0], [5,8,type,owner]]), c(owner), status);
      const before = state;
      state = play(state, rotation, [5,5], [5,8]);
      expect(state.board[s(5,5)]).toBeNull();
      expect(state.board[s(5,8)]).toEqual({ type:R, owner:rotation, hasMoved:true });
      expect(state.players).toEqual(before.players);
      expect(state.moveHistory.at(-1)!.captured).toEqual(before.board[s(5,8)]);
      expect(state.moveHistory.at(-1)!.eliminates).toEqual([]);
    }
    // Also capture a pawn directly from each actual deferred transition.
    for (const status of statuses) {
      const state = play(pending(status, 3, [[3,9,R,1]]), rotation, [13,7], [12,7]);
      const after = play(state, rotation, [3,9], [3,11]);
      expect(after.players[c(1)].score).toBe(state.players[c(1)].score);
      expect(after.moveHistory.at(-1)!.captured?.owner).toBe(rotation);
    }
  });

  it("FFA-DEAD-04: passive occupancy blocks slider rays and pawn pushes but knights can jump", () => {
    for (const status of statuses) for (const type of [R,B,Q]) {
      const diagonal = type === B;
      const target = diagonal ? [7,7] as const : [5,7] as const;
      const beyond = diagonal ? [8,8] as const : [5,8] as const;
      const state = passive(position(rotation, [...kings, [5,5,type,0], [...target,P,1]]), c(1), status);
      const moves = legalMoves(state).filter(m => m.from === s(5,5));
      expect(moves.some(m => m.to === s(target[0], target[1]))).toBe(true);
      expect(moves.some(m => m.to === s(beyond[0], beyond[1]))).toBe(false);
    }
    for (const status of statuses) for (const rank of [2,3]) {
      const state = passive(position(rotation, [...kings, [6,1,P,0,false], [6,rank,P,1], [5,1,N,0]]), c(1), status);
      const moves = legalMoves(state);
      expect(moves.some(m => m.from === s(6,1) && m.to === s(6,3))).toBe(false);
      expect(moves.some(m => m.from === s(6,1) && m.to === s(6,2))).toBe(rank === 3);
      expect(moves.some(m => m.from === s(5,1) && m.to === s(7,2))).toBe(true);
    }
  });

  it("FFA-DEAD-05: passive screens stop active attacks, and removing a screen still requires king safety", () => {
    for (const status of statuses) {
      const state = passive(position(rotation, [...kings, [7,2,P,1], [7,5,R,2], [5,1,N,0]]), c(1), status);
      expect(isPlayerInCheck(state, rotation)).toBe(false);
      expect(legalMoves(state).some(m => m.from === s(5,1) && m.to === s(7,2))).toBe(true);
      const board = state.board.slice(); board[s(7,2)] = null;
      expect(isPlayerInCheck({ ...state, board }, rotation)).toBe(true);
      // EP removes the screen and moves the capturer off the rook's file.
      const ep = passive(position(rotation, [...kings, [7,3,P,1], [7,5,R,2], [7,2,P,0]]), c(1), status);
      const withRight: GameState = { ...ep, enPassantRights: [{ target:s(8,3), pawnSquare:s(7,3), pawnOwner:c(1), eligiblePlayers:[rotation] }] };
      expect(pseudoLegalMoves(withRight).some(m => m.enPassantCapture === s(7,3))).toBe(true);
      expect(legalMoves(withRight).some(m => m.enPassantCapture === s(7,3))).toBe(false);
    }
  });

  it("FFA-DEAD-06: all passive piece geometries cease attacking or moving", () => {
    // Pawn belongs to relative Blue, hence attacks (6,5) from (5,4).
    for (const status of statuses) for (const [type, from] of [[P,[5,4]], [N,[4,4]], [B,[4,3]], [R,[6,8]], [Q,[6,8]], [K,[7,5]]] as const) {
      const state = position(rotation, [[6,5,K,0], ...(type === K ? [] : [[0,6,K,1] as const]), [...from,type,1], [6,13,K,2], [13,7,K,3]]);
      expect(isPlayerInCheck(state, rotation)).toBe(true);
      const dead = passive(state, c(1), status);
      expect(isPlayerInCheck(dead, rotation)).toBe(false);
      expect(legalMoves(dead).some(m => m.to === s(5,5))).toBe(true);
      assertImmobile(dead, c(1));
      expect(() => applyMoveRequest({ ...dead, turn:c(1) }, { from:s(from[0], from[1]), to:s(6,5) })).toThrow();
    }
  });

  it("FFA-DEAD-07: resolution clears castling and the dying owner's EP eligibility only", () => {
    for (const status of statuses) {
      let state = pending(status, 3, [[9,8,P,2]]);
      state = { ...state, castlingRights:{ ...state.castlingRights, [rotation]:{ kingside:true, queenside:true } },
        enPassantRights:[{ target:s(9,9), pawnSquare:s(9,8), pawnOwner:c(2), eligiblePlayers:[rotation,c(1)] }] };
      state = play(state, rotation, [13,7], [12,7]);
      expect(state.players[rotation].status).toBe(status);
      expect(state.castlingRights[rotation]).toEqual({ kingside:false, queenside:false });
      expect(state.enPassantRights).toEqual([{ target:s(9,9), pawnSquare:s(9,8), pawnOwner:c(2), eligiblePlayers:[c(1)] }]);
      assertImmobile(state);
    }
  });

  it("FFA-DEAD-08: an explicitly pending right survives victim death and captures that pawn for zero", () => {
    for (const status of statuses) {
      // Synthetic pre-resolution snapshot, not a claim that this full history
      // follows from a normal opening. The pushed pawn is pinned to the king.
      let state = pending(status, 3, [[6,3,P,0], [9,6,B,1], [5,3,P,1], [7,3,P,2]]);
      // Cover (4,1) from (6,0) instead, leaving the skipped square empty.
      const board = state.board.slice();
      board[s(6,0)] = board[s(6,2)]; board[s(6,2)] = null;
      const right = { target:s(6,2), pawnSquare:s(6,3), pawnOwner:rotation, eligiblePlayers:[c(1),c(2)] };
      state = { ...state, board, enPassantRights:[right] };
      expect(hasLegalMove(state, rotation)).toBe(false);
      state = play(state, rotation, [13,7], [12,7]);
      expect(state.players[rotation].status).toBe(status);
      expect(state.enPassantRights).toEqual([right]);
      expect(state.board[s(6,3)]).toEqual({ type:P, owner:rotation, hasMoved:true });
      const restored: GameState = JSON.parse(JSON.stringify(state));
      const after = play(state, rotation, [5,3], [6,2]);
      expect(play(restored, rotation, [5,3], [6,2])).toEqual(after);
      expect(after.board[s(6,3)]).toBeNull();
      expect(after.board[s(6,2)]).toEqual({ type:P, owner:c(1), hasMoved:true });
      expect(after.enPassantRights).toEqual([]);
      expect(after.moveHistory.at(-1)!.enPassantCapture).toBe(s(6,3));
      expect(ALL_COLORS.map(owner => after.players[owner].score)).toEqual(ALL_COLORS.map(owner => state.players[owner].score));
      expect(legalMoves(after, c(2)).some(m => m.enPassantCapture !== undefined)).toBe(false);
    }
  });
});
