import { describe, expect, it } from "vitest";
import { ALL_COLORS, GameState, Piece, PlayerColor, PlayerStatus, applyMoveRequest, castlingMoves, legalMoves, positionKey, pseudoLegalMoves, squareOf } from "../src/index.js";
import { B, K, N, R, Placement, colorAt, kings, play, position, quiet, sq } from "./ffa-helpers.js";

// Explicit Red-frame inputs. Expected absolute destinations below do not call
// the engine's castle geometry helpers. Every scenario runs for all four seats.
const sides = [
  { side: "kingside", rook: 10, kingTo: 9, rookTo: 8, path: [8, 9] },
  { side: "queenside", rook: 3, kingTo: 5, rookTo: 6, path: [4, 5, 6] },
] as const;
const absolute = [
  { king: [7, 0], kingside: [[10, 0], [9, 0], [8, 0]], queenside: [[3, 0], [5, 0], [6, 0]] },
  { king: [0, 6], kingside: [[0, 3], [0, 4], [0, 5]], queenside: [[0, 10], [0, 8], [0, 7]] },
  { king: [6, 13], kingside: [[3, 13], [4, 13], [5, 13]], queenside: [[10, 13], [8, 13], [7, 13]] },
  { king: [13, 7], kingside: [[13, 10], [13, 9], [13, 8]], queenside: [[13, 3], [13, 5], [13, 6]] },
] as const;
const noRights = { kingside: false, queenside: false };
const bothRights = { kingside: true, queenside: true };
const inactive: readonly PlayerStatus[] = ["checkmated", "stalemated", "resigned"];

for (const rotation of ALL_COLORS) describe(`FFA castling: ${PlayerColor[rotation]}`, () => {
  const s = (f: number, r: number) => sq(rotation, f, r);
  function castlePosition(extra: readonly Placement[] = [], turn = 0): GameState {
    const state = position(rotation, [[7, 0, K, 0, false], ...kings.slice(1), [3, 0, R, 0, false], [10, 0, R, 0, false], ...extra], turn);
    return { ...state, castlingRights: { ...state.castlingRights, [rotation]: bothRights } };
  }
  function replace(state: GameState, f: number, r: number, piece: Piece | null): GameState {
    const board = state.board.slice();
    board[s(f, r)] = piece;
    return { ...state, board };
  }
  function status(state: GameState, owner: PlayerColor, value: PlayerStatus): GameState {
    return { ...state, players: { ...state.players, [owner]: { ...state.players[owner], status: value } } };
  }
  function expectCastle(state: GameState, side: typeof sides[number], allowed: boolean): void {
    const before = JSON.stringify(state);
    expect(legalMoves(state, rotation).some(m => m.castle === side.side)).toBe(allowed);
    if (!allowed && state.turn === rotation) {
      expect(() => applyMoveRequest(state, { from: s(7, 0), to: s(side.kingTo, 0) })).toThrow(/legal move/);
    }
    expect(JSON.stringify(state)).toBe(before);
  }
  function roundToOwner(state: GameState): GameState {
    return quiet(quiet(quiet(state, rotation), rotation), rotation);
  }

  for (const [index, side] of sides.entries()) it(`FFA-CASTLE-0${index + 1}: exact ${side.side} destinations and immutable application`, () => {
    const state = castlePosition();
    const oracle = absolute[rotation];
    const [rookFrom, kingTo, rookTo] = oracle[side.side].map(([f, r]) => squareOf(f, r));
    const kingFrom = squareOf(oracle.king[0], oracle.king[1]);
    const move = legalMoves(state).find(m => m.castle === side.side);
    expect(move).toMatchObject({ from: kingFrom, to: kingTo, piece: { type: K, owner: rotation } });
    const before = JSON.stringify(state);
    const after = applyMoveRequest(state, { from: kingFrom, to: kingTo });
    const expectedBoard = state.board.slice();
    expectedBoard[kingFrom] = null;
    expectedBoard[rookFrom] = null;
    expectedBoard[kingTo] = { type: K, owner: rotation, hasMoved: true };
    expectedBoard[rookTo] = { type: R, owner: rotation, hasMoved: true };
    expect(after.board).toEqual(expectedBoard);
    expect(after.castlingRights[rotation]).toEqual(noRights);
    expect(after.players).toEqual(state.players);
    expect(after.turn).toBe(colorAt(rotation, 1));
    expect(after.moveHistory).toEqual([move]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("FFA-CASTLE-03: missing, moved, off-home, or wrong-type king cannot castle", () => {
    for (const piece of [null, { type: K, owner: rotation, hasMoved: true }, { type: B, owner: rotation, hasMoved: false }]) {
      const state = replace(castlePosition(), 7, 0, piece);
      for (const side of sides) expectCastle(state, side, false);
    }
    let state = replace(castlePosition(), 7, 0, null);
    state = replace(state, 7, 1, { type: K, owner: rotation, hasMoved: false });
    expect(castlingMoves(state, rotation)).toEqual([]);
  });

  it("FFA-CASTLE-04: missing, moved, or wrong-type rook disables only its side", () => {
    for (const side of sides) for (const piece of [null, { type: R, owner: rotation, hasMoved: true }, { type: B, owner: rotation, hasMoved: false }]) {
      const state = replace(castlePosition(), side.rook, 0, piece);
      expectCastle(state, side, false);
      expectCastle(state, sides.find(other => other !== side)!, true);
    }
  });

  it("FFA-CASTLE-05: neither active nor dead foreign home pieces confer castling", () => {
    for (const ownerOffset of [1, 2, 3] as const) for (const value of ["active", ...inactive] as const) {
      const owner = colorAt(rotation, ownerOffset);
      // Keep a real own king elsewhere: absence of an own king must not mask
      // the foreign-home-king bug in pseudo/legal generation or the API.
      let kingState = replace(castlePosition(), 7, 0, { type: K, owner, hasMoved: false });
      const ownKing: Placement = [7, 3, K, 0];
      kingState = replace(kingState, ownKing[0], ownKing[1], { type: K, owner: rotation, hasMoved: true });
      // Remove the foreign owner's original king to keep a single king/owner.
      const home = kings[ownerOffset];
      kingState = replace(kingState, home[0], home[1], null);
      kingState = status(kingState, owner, value);
      expect(pseudoLegalMoves(kingState).filter(m => m.castle)).toEqual([]);
      for (const side of sides) {
        expectCastle(kingState, side, false);
        const state = status(replace(castlePosition(), side.rook, 0, { type: R, owner, hasMoved: false }), owner, value);
        expect(castlingMoves(state, rotation).some(m => m.castle === side.side)).toBe(false);
        expectCastle(state, side, false);
        // Recomputing after an unrelated legal move must not certify a dead
        // foreign rook as an original rook (active rooks may check the king).
        if (value !== "active") {
          const advanced = quiet({ ...state, turn: colorAt(rotation, ownerOffset === 1 ? 2 : 1) }, rotation);
          expect(advanced.castlingRights[rotation][side.side]).toBe(false);
        }
      }
    }
  });

  it("FFA-CASTLE-06: king move and return permanently revoke both rights", () => {
    let state = play(castlePosition(), rotation, [7, 0], [7, 1]);
    expect(state.castlingRights[rotation]).toEqual(noRights);
    state = roundToOwner(state);
    state = play(state, rotation, [7, 1], [7, 0]);
    expect(state.castlingRights[rotation]).toEqual(noRights);
    for (const side of sides) expectCastle(state, side, false);
  });

  it("FFA-CASTLE-07: rook move and return revoke only that rook's right", () => {
    for (const side of sides) {
      let state = play(castlePosition(), rotation, [side.rook, 0], [side.rook, 1]);
      const expected = { ...bothRights, [side.side]: false };
      expect(state.castlingRights[rotation]).toEqual(expected);
      state = roundToOwner(state);
      state = play(state, rotation, [side.rook, 1], [side.rook, 0]);
      expect(state.castlingRights[rotation]).toEqual(expected);
      expectCastle(state, side, false);
      expectCastle(state, sides.find(other => other !== side)!, true);
    }
  });

  it("FFA-CASTLE-08: each opponent's home-rook capture revokes only that side", () => {
    for (const side of sides) for (const opponent of [1, 2, 3] as const) {
      // Knight captures without leaving the home king in check.
      const file = side.side === "queenside" ? 4 : 9;
      let state = castlePosition([[file, 2, N, opponent]], opponent);
      state = play(state, rotation, [file, 2], [side.rook, 0]);
      expect(state.castlingRights[rotation]).toEqual({ ...bothRights, [side.side]: false });
      expectCastle(state, side, false);
      expectCastle(state, sides.find(other => other !== side)!, true);
    }
  });

  it("FFA-CASTLE-09: revoked rights survive quiet play, replacement, and JSON round-trip", () => {
    for (const rights of [noRights, { kingside: false, queenside: true }, { kingside: true, queenside: false }]) {
      const base = castlePosition([], 1);
      // Explicit saved-state input: replacement/unmoved home pieces cannot
      // restore a previously revoked right, regardless of hasMoved flags.
      const state = { ...base, castlingRights: { ...base.castlingRights, [rotation]: rights } };
      expect(positionKey(state)).not.toBe(positionKey(base));
      const after = quiet(state, rotation);
      expect(after.castlingRights[rotation]).toEqual(rights);
      const restored = JSON.parse(JSON.stringify(after)) as GameState;
      expect(restored.castlingRights).toEqual(after.castlingRights);
      expect(legalMoves(restored, rotation)).toEqual(legalMoves(after, rotation));
      for (const side of sides) expectCastle(restored, side, rights[side.side]);
    }
  });

  it("FFA-CASTLE-10: every intervening square must be empty, including the rook-only square", () => {
    for (const side of sides) for (const file of side.path) for (const owner of [0, 1, 2, 3] as const) {
      const state = castlePosition([[file, 0, N, owner]]);
      expect(castlingMoves(state, rotation).some(m => m.castle === side.side)).toBe(false);
      expectCastle(state, side, false);
    }
  });

  it("FFA-CASTLE-11: each active opponent's check prevents either castle", () => {
    for (const opponent of [1, 2, 3] as const) {
      const state = castlePosition([[7, 4, R, opponent]]);
      for (const side of sides) expectCastle(state, side, false);
    }
  });

  it("FFA-CASTLE-12: each active opponent's transit attack prevents castling", () => {
    for (const side of sides) for (const opponent of [1, 2, 3] as const) {
      expectCastle(castlePosition([[side.rookTo, 4, R, opponent]]), side, false);
      expectCastle(castlePosition(), side, true);
    }
  });

  it("FFA-CASTLE-13: each active opponent's destination attack prevents castling", () => {
    for (const side of sides) for (const opponent of [1, 2, 3] as const) {
      expectCastle(castlePosition([[side.kingTo, 4, R, opponent]]), side, false);
      expectCastle(castlePosition(), side, true);
    }
  });

  it("FFA-CASTLE-14: attacks on only the rook or queenside rook-only path are allowed", () => {
    for (const side of sides) for (const opponent of [1, 2, 3] as const) {
      for (const file of side.side === "queenside" ? [3, 4] : [10]) {
        const state = castlePosition([[file, 4, R, opponent]]);
        expectCastle(state, side, true);
        play(state, rotation, [7, 0], [side.kingTo, 0]);
      }
    }
  });

  it("FFA-CASTLE-15: dead pieces block every path square and can screen active attacks", () => {
    for (const side of sides) for (const value of inactive) for (const owner of [1, 2, 3] as const) {
      for (const file of side.path) {
        const state = status(castlePosition([[file, 0, N, owner]]), colorAt(rotation, owner), value);
        expectCastle(state, side, false);
      }
      // A passive obstacle off the castle path screens an active rook.
      const attacker = (owner === 1 ? 2 : 1) as PlayerColor;
      for (const file of [7, side.rookTo, side.kingTo]) {
        const base = castlePosition([[file, 4, R, attacker], [file, 2, B, owner]]);
        const screened = status(base, colorAt(rotation, owner), value);
        expectCastle(screened, side, true);
        expectCastle(replace(screened, file, 2, null), side, false);
      }
    }
  });

  it("FFA-CASTLE-16: dead attacks do not forbid castles; inactive owners lose all rights", () => {
    for (const value of inactive) {
      for (const side of sides) for (const owner of [1, 2, 3] as const) for (const file of [7, side.rookTo, side.kingTo]) {
        const active = castlePosition([[file, 4, R, owner]]);
        expectCastle(active, side, false);
        const dead = status(active, colorAt(rotation, owner), value);
        expectCastle(dead, side, true);
        const after = play(dead, rotation, [7, 0], [side.kingTo, 0]);
        expect(after.board[s(file, 4)]).toEqual(dead.board[s(file, 4)]);
      }
      const deadOwner = status(castlePosition([], 1), rotation, value);
      expect(castlingMoves(deadOwner, rotation)).toEqual([]);
      expect(pseudoLegalMoves(deadOwner, rotation)).toEqual([]);
      expect(legalMoves(deadOwner, rotation)).toEqual([]);
      expect(quiet(deadOwner, rotation).castlingRights[rotation]).toEqual(noRights);
    }
    // Existing deferred-mate transition: both home rights are still present
    // before rotation, but must be cleared in the same state as elimination.
    const pendingMate = castlePosition([[6, 4, R, 1], [7, 4, R, 1], [8, 4, R, 1], [5, 1, N, 1], [9, 1, N, 1]], 3);
    expect(legalMoves(pendingMate, rotation)).toEqual([]);
    const eliminated = quiet(pendingMate, rotation);
    expect(eliminated.players[rotation].status).toBe("checkmated");
    expect(eliminated.castlingRights[rotation]).toEqual(noRights);
  });
});
