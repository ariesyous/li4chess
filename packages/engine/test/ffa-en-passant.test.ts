import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, PlayerColor, legalMoves, positionKey, pseudoLegalMoves } from "../src/index.js";
import { K, N, P, R, colorAt, kings, play, position, quiet, sq } from "./ffa-helpers.js";

for (const rotation of ALL_COLORS) describe(`FFA en passant: ${PlayerColor[rotation]}`, () => {
  const s = (f: number, r: number) => sq(rotation, f, r);
  const c = (offset: number) => colorAt(rotation, offset);
  const right = (eligiblePlayers: readonly PlayerColor[]) => ({ target: s(6,2), pawnSquare: s(6,3), pawnOwner: rotation, eligiblePlayers });
  const start = () => position(rotation, [...kings, [6,1,P,0,false], [5,3,P,1], [7,3,P,2], [7,1,P,3]]);
  const pushed = () => play(start(), rotation, [6,1], [6,3]);
  const epMoves = (state: GameState, owner = state.turn) => legalMoves(state, owner).filter(m => m.enPassantCapture !== undefined);

  it("FFA-EP-01: explicit skipped square and captured pawn for both diagonals of every opponent", () => {
    const relations = [[1,5,1], [1,5,3], [2,5,3], [2,7,3], [3,7,1], [3,7,3]] as const;
    for (const [owner,f,r] of relations) {
      let state = position(rotation, [...kings, [6,1,P,0,false], [f,r,P,owner]]);
      state = play(state, rotation, [6,1], [6,3]);
      expect(state.enPassantRights).toEqual([right([c(owner)])]);
      while (state.turn !== c(owner)) state = quiet(state, rotation);
      expect(epMoves(state).map(m => [m.from,m.to,m.enPassantCapture])).toEqual([[s(f,r),s(6,2),s(6,3)]]);
      state = play(state, rotation, [f,r], [6,2]);
      expect(state.board[s(6,3)]).toBeNull();
      expect(state.board[s(6,2)]).toEqual({ type:P, owner:c(owner), hasMoved:true });
      expect(state.players[c(owner)].score).toBe(1);
      expect(state.enPassantRights).toEqual([]);
    }
  });
  it("FFA-EP-02: eligibility survives intervening turns until each owner's next turn", () => {
    let state = pushed();
    expect(state.enPassantRights).toEqual([right(ALL_COLORS.filter(x => x !== rotation))]);
    for (const owner of [1,2,3]) {
      expect(state.turn).toBe(c(owner));
      expect(epMoves(state)).toHaveLength(1);
      state = quiet(state, rotation);
    }
    expect(state.enPassantRights).toEqual([]);
  });
  it("FFA-EP-03: declining expires only that player's right and cannot regain it", () => {
    let state = quiet(pushed(), rotation);
    expect(state.enPassantRights).toEqual([right(ALL_COLORS.filter(x => x === c(2) || x === c(3)))]);
    expect(epMoves(state,c(1))).toEqual([]);
    state = quiet(state,rotation);
    expect(epMoves(state,c(2))).toEqual([]);
    expect(epMoves(state,c(3))).toHaveLength(1);
    state = quiet(state,rotation);
    expect(epMoves(state,c(1))).toEqual([]);
  });
  it("FFA-EP-04: a second double push retains independent pending targets", () => {
    let state = position(rotation, [...kings, [6,1,P,0,false], [7,3,P,2], [1,5,P,1,false], [3,4,P,0]]);
    state = play(state,rotation,[6,1],[6,3]);
    state = play(state,rotation,[1,5],[3,5]);
    expect(state.enPassantRights).toEqual([
      right([c(2)]), { target:s(2,5), pawnSquare:s(3,5), pawnOwner:c(1), eligiblePlayers:[rotation] },
    ]);
    state = play(state,rotation,[7,3],[6,2]);
    expect(state.enPassantRights).toHaveLength(1);
    state = quiet(state,rotation);
    state = play(state,rotation,[3,4],[2,5]);
    expect(state.board[s(3,5)]).toBeNull();
    expect(state.enPassantRights).toEqual([]);
  });
  it("FFA-EP-05: capture removes the opportunity for all other eligible players", () => {
    const state = play(pushed(),rotation,[5,3],[6,2]);
    expect(state.enPassantRights).toEqual([]);
    expect(epMoves(state,c(2))).toEqual([]);
    expect(epMoves(state,c(3))).toEqual([]);
  });
  it("FFA-EP-06: ordinary capture of the pushed pawn invalidates its pending right", () => {
    let state = position(rotation,[...kings,[6,1,P,0,false],[5,3,P,1],[7,3,P,2],[6,5,R,3]]);
    state = play(state,rotation,[6,1],[6,3]);
    state = quiet(state,rotation);
    state = play(state,rotation,[6,13],[7,13]);
    state = play(state,rotation,[6,5],[6,3]);
    expect(state.enPassantRights).toEqual([]);
    expect(state.board[s(6,3)]?.owner).toBe(c(3));
  });
  it("FFA-EP-07: eligibility is fixed immediately after the push, not granted to a later-arriving pawn", () => {
    let state = position(rotation,[...kings,[6,1,P,0,false],[4,3,P,1],[7,3,P,2]]);
    state = play(state,rotation,[6,1],[6,3]);
    expect(state.enPassantRights).toEqual([right([c(2)])]);
    state = play(state,rotation,[4,3],[5,3]);
    expect(epMoves(state,c(1))).toEqual([]);
    expect(epMoves(state,c(2))).toHaveLength(1);
  });
  it("FFA-EP-08: a pinned pawn has eligibility but cannot leave its king exposed", () => {
    let state = position(rotation,[[3,0,K,0],[0,6,K,1],[7,6,K,2],[13,7,K,3],[6,1,P,0,false],[7,3,P,2],[7,1,R,3]]);
    state = play(state,rotation,[6,1],[6,3]);
    state = quiet(state,rotation);
    expect(state.enPassantRights).toEqual([right([c(2)])]);
    expect(pseudoLegalMoves(state).some(m => m.enPassantCapture === s(6,3))).toBe(true);
    expect(epMoves(state)).toEqual([]);
  });
  it("FFA-EP-09: removing the victim must also be included in king-safety simulation", () => {
    let state = position(rotation,[[7,0,K,0],[0,6,K,1],[9,3,K,2],[13,7,K,3],[6,1,P,0,false],[7,3,P,2],[3,3,R,3]]);
    state = play(state,rotation,[6,1],[6,3]);
    state = quiet(state,rotation);
    expect(pseudoLegalMoves(state).some(m => m.enPassantCapture === s(6,3))).toBe(true);
    expect(epMoves(state)).toEqual([]);
    // Removing the attacking rook gives a positive control for the same geometry.
    const board = state.board.slice(); board[s(3,3)] = null;
    expect(epMoves({...state,board})).toHaveLength(1);
  });
  it("FFA-EP-10: an eligible active pawn captures a dead double-pushed pawn for zero points", () => {
    for (const status of ["checkmated","stalemated","resigned"] as const) {
      let state = pushed();
      // Explicit accepted post-death snapshot. FFA-DEAD also covers retained
      // mate/stalemate transitions; resign/timeout actions remain WALK work.
      state = {...state, players:{...state.players,[rotation]:{...state.players[rotation],status}}};
      expect(epMoves(state)).toHaveLength(1);
      state = play(state,rotation,[5,3],[6,2]);
      expect(state.board[s(6,3)]).toBeNull();
      expect(state.board[s(6,2)]?.owner).toBe(c(1));
      expect(ALL_COLORS.map(x => state.players[x].score)).toEqual([0,0,0,0]);
      expect(state.moveHistory.at(-1)!.enPassantCapture).toBe(s(6,3));
    }
  });
  it("FFA-EP-11: inactive capturers neither acquire nor exercise rights and are skipped", () => {
    let state = start();
    state = {...state,players:{...state.players,[c(1)]:{...state.players[c(1)],status:"stalemated"}}};
    state = play(state,rotation,[6,1],[6,3]);
    expect(state.turn).toBe(c(2));
    expect(state.enPassantRights).toEqual([right(ALL_COLORS.filter(x => x === c(2) || x === c(3)))]);
    expect(epMoves(state,c(1))).toEqual([]);
    // An already granted right must not keep a newly inactive player eligible.
    state = {...state,players:{...state.players,[c(3)]:{...state.players[c(3)],status:"stalemated"}}};
    expect(epMoves(state,c(3))).toEqual([]);
    state = quiet(state,rotation);
    expect(state.enPassantRights).toEqual([]);
  });
  it("FFA-EP-12: immutable JSON state and position identity include every pending right", () => {
    const state = pushed();
    const restored: GameState = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(epMoves(restored)).toEqual(epMoves(state));
    expect(play(restored,rotation,[5,3],[6,2])).toEqual(play(state,rotation,[5,3],[6,2]));
    for (const rights of [[], [right([c(2)])], [{...right([c(1)]),pawnSquare:s(5,3)}]]) {
      expect(positionKey({...state,enPassantRights:rights})).not.toBe(positionKey(state));
    }
  });
});
