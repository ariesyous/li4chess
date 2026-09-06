import { describe, expect, it } from "vitest";
import { localSquare } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, GameState, PieceType } from "../src/types.js";
import { pseudoLegalMoves } from "../src/movegen/index.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
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

  // The former opposite-seat-only EP assertion was an implementation bug.
  // Accepted adjacent/opposite geometry is now exercised by FFA-EP-01.
});
