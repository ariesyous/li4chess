import { describe, expect, it } from "vitest";
import { localSquare, VALID_SQUARES } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, GameState, PieceType, PlayerColor } from "../src/types.js";
import { pseudoLegalMoves } from "../src/movegen/index.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
}

/** Find a placement for `attacker`'s pawn (anywhere on the board) that can en-passant capture at `target`. */
function findEnPassantAttacker(
  baseState: GameState,
  target: number,
  attacker: PlayerColor
): boolean {
  for (const square of VALID_SQUARES) {
    if (baseState.board[square] !== null) continue;
    const board = baseState.board.slice();
    board[square] = { type: PieceType.Pawn, owner: attacker, hasMoved: true };
    const trial = { ...baseState, board, turn: attacker };
    const moves = pseudoLegalMoves(trial, attacker);
    if (moves.some((m) => m.enPassantCapture !== undefined && m.to === target)) return true;
  }
  return false;
}

describe("pawn moves per orientation", () => {
  it("promotes on reaching local rank 13, for every color", () => {
    for (const color of ALL_COLORS) {
      const state = emptyState();
      const board = state.board.slice();
      const from = localSquare(color, 3, 12);
      board[from] = { type: PieceType.Pawn, owner: color, hasMoved: true };
      const testState = { ...state, board, turn: color };

      const moves = pseudoLegalMoves(testState, color);
      const promotions = moves.filter((m) => m.promotion !== undefined);
      expect(promotions.length).toBe(4); // Q, R, B, N
      for (const m of promotions) {
        expect(m.to).toBe(localSquare(color, 3, 13));
      }
    }
  });

  it("only the opposite player (across the board) can en passant capture a double push, never an adjacent one", () => {
    // Red double-pushes; the en passant target is the passed-over square.
    // Red<->Yellow are opposite (forward vectors negate); Blue/Green are adjacent (perpendicular).
    const state = emptyState();
    const board = state.board.slice();
    const from = localSquare(PlayerColor.Red, 3, 1);
    board[from] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: false };
    const s0: GameState = { ...state, board, turn: PlayerColor.Red };

    const moves = pseudoLegalMoves(s0, PlayerColor.Red);
    const pushes = moves.filter((m) => m.from === from && !m.promotion);
    expect(pushes.length).toBe(2);

    // Determine which of the two push destinations is the "single step" (i.e. the one that,
    // if occupied, would block the other) — simplest robust way: the double push is whichever
    // move has NO other same-from push landing beyond it in the same direction one step further.
    const [a, b] = pushes;
    const singleStep = Math.abs(a.to - from) < Math.abs(b.to - from) ? a : b;
    const doubleStep = singleStep === a ? b : a;

    const afterPush: GameState = {
      ...s0,
      board: (() => {
        const b2 = s0.board.slice();
        b2[doubleStep.to] = b2[from];
        b2[from] = null;
        return b2;
      })(),
      enPassantTarget: singleStep.to,
    };

    expect(findEnPassantAttacker(afterPush, singleStep.to, PlayerColor.Yellow)).toBe(true);
    expect(findEnPassantAttacker(afterPush, singleStep.to, PlayerColor.Blue)).toBe(false);
    expect(findEnPassantAttacker(afterPush, singleStep.to, PlayerColor.Green)).toBe(false);
  });
});
