import { describe, expect, it } from "vitest";
import { isOnBoard, localSquare, squareOf, fileOf, rankOf, VALID_SQUARES } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, PieceType, PlayerColor } from "../src/types.js";
import { pseudoLegalMoves } from "../src/movegen/index.js";

describe("pseudo-legal move generation", () => {
  it("starting position: every player has the same number of legal moves (4-fold symmetry)", () => {
    const state = createInitialState();
    const counts = ALL_COLORS.map((color) => pseudoLegalMoves(state, color).length);
    expect(counts[1]).toBe(counts[0]);
    expect(counts[2]).toBe(counts[0]);
    expect(counts[3]).toBe(counts[0]);
  });

  it("starting position: Red has the standard 20 pseudo-legal moves (16 pawn + 4 knight)", () => {
    const state = createInitialState();
    const moves = pseudoLegalMoves(state, PlayerColor.Red);
    expect(moves.length).toBe(20);
  });

  it("every generated destination square is a valid on-board square, for every color", () => {
    const state = createInitialState();
    for (const color of ALL_COLORS) {
      for (const move of pseudoLegalMoves(state, color)) {
        expect(isOnBoard(fileOf(move.to), rankOf(move.to))).toBe(true);
      }
    }
  });

  it("a rook near a corner cutout does not see through or wrap around the cutout", () => {
    // Place a lone Red rook at local (0,0) — Red's queenside rook start square,
    // which sits directly adjacent to the bottom-left cutout.
    const state = createInitialState();
    const board = state.board.slice();
    for (let i = 0; i < board.length; i++) board[i] = null;
    const rookSquare = localSquare(PlayerColor.Red, 0, 0);
    board[rookSquare] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: true };
    const testState = { ...state, board };

    const moves = pseudoLegalMoves(testState, PlayerColor.Red);
    for (const move of moves) {
      expect(isOnBoard(fileOf(move.to), rankOf(move.to))).toBe(true);
    }
    // Rook at file=3,rank=0 (Red local (0,0)): should NOT be able to "wrap" to file<3 at rank<3 (the cutout).
    for (const move of moves) {
      const f = fileOf(move.to);
      const r = rankOf(move.to);
      expect(f < 3 && r < 3).toBe(false);
    }
  });

  it("pawns generate exactly the standard double-push option from their starting square, for every orientation", () => {
    const state = createInitialState();
    for (const color of ALL_COLORS) {
      const moves = pseudoLegalMoves(state, color);
      const pawnMovesFromStart = moves.filter((m) => m.piece.type === PieceType.Pawn);
      // 8 pawns, each with 1-step + 2-step = 16 total pushes (no captures available at start)
      expect(pawnMovesFromStart.length).toBe(16);
    }
  });

  it("castling is not available from the initial position (knight/bishop block both rooks)", () => {
    const state = createInitialState();
    for (const color of ALL_COLORS) {
      const moves = pseudoLegalMoves(state, color);
      expect(moves.some((m) => m.castle)).toBe(false);
    }
  });

  it("castling becomes available once the path between king and rook is cleared, for every orientation", () => {
    for (const color of ALL_COLORS) {
      const state = createInitialState();
      const board = state.board.slice();
      // Clear squares between king (local file 4) and kingside rook (local file 7): files 5,6
      board[localSquare(color, 5, 0)] = null;
      board[localSquare(color, 6, 0)] = null;
      board[localSquare(color, 5, 1)] = null;
      board[localSquare(color, 6, 1)] = null;
      const testState = { ...state, board };
      const moves = pseudoLegalMoves(testState, color);
      const castleMoves = moves.filter((m) => m.castle === "kingside");
      expect(castleMoves.length).toBe(1);
      expect(castleMoves[0].to).toBe(localSquare(color, 6, 0));
    }
  });
});
