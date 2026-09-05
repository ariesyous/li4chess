import { describe, expect, it } from "vitest";
import { localSquare, squareOf } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, GameState, PieceType, PlayerColor } from "../src/types.js";
import { legalMoves } from "../src/rules/legality.js";
import { isPlayerInCheck } from "../src/rules/check.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
}

describe("legality filtering", () => {
  it("starting position: every player has the same number of legal moves (4-fold symmetry)", () => {
    const state = createInitialState();
    const counts = ALL_COLORS.map((color) => legalMoves(state, color).length);
    expect(counts[1]).toBe(counts[0]);
    expect(counts[2]).toBe(counts[0]);
    expect(counts[3]).toBe(counts[0]);
    expect(counts[0]).toBe(20);
  });

  it("a pinned piece cannot move if doing so exposes its own king to check", () => {
    const state = emptyState();
    const board = state.board.slice();
    const kingSquare = localSquare(PlayerColor.Red, 4, 0);
    const bishopSquare = localSquare(PlayerColor.Red, 4, 1); // directly in front of the king
    const attackerSquare = localSquare(PlayerColor.Red, 4, 5); // same file, further along
    board[kingSquare] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: false };
    board[bishopSquare] = { type: PieceType.Bishop, owner: PlayerColor.Red, hasMoved: false };
    board[attackerSquare] = { type: PieceType.Rook, owner: PlayerColor.Blue, hasMoved: false };
    // Give Blue a king somewhere harmless so findKingSquare/isInCheck machinery has something to find.
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    const testState = { ...state, board, turn: PlayerColor.Red };

    const moves = legalMoves(testState, PlayerColor.Red);
    // The pinned bishop (off-diagonal moves are illegal; it can't move at all off this file)
    expect(moves.some((m) => m.from === bishopSquare)).toBe(false);
  });

  it("a move can put two different opponents' kings in check simultaneously", () => {
    // A Red queen slides up file 6 from (6,0) to (6,6). From (6,6) it shares a rank
    // with a Blue king at (10,6), and a diagonal with a Yellow king at (8,8) — a genuine double check.
    const state = emptyState();
    const board = state.board.slice();
    const queenFrom = squareOf(6, 0);
    board[queenFrom] = { type: PieceType.Queen, owner: PlayerColor.Red, hasMoved: true };
    board[localSquare(PlayerColor.Red, 0, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(10, 6)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    board[squareOf(8, 8)] = { type: PieceType.King, owner: PlayerColor.Yellow, hasMoved: true };
    board[localSquare(PlayerColor.Green, 0, 0)] = { type: PieceType.King, owner: PlayerColor.Green, hasMoved: true };

    const testState = { ...state, board, turn: PlayerColor.Red };
    const moves = legalMoves(testState, PlayerColor.Red);
    const doubleCheckMove = moves.find((m) => m.from === queenFrom && m.to === squareOf(6, 6));
    expect(doubleCheckMove).toBeDefined();
    expect(doubleCheckMove!.isCheck).toHaveLength(2);
    expect(doubleCheckMove!.isCheck).toEqual(expect.arrayContaining([PlayerColor.Blue, PlayerColor.Yellow]));
  });

  it("castling is illegal while the king is currently in check", () => {
    const state = emptyState();
    const board = state.board.slice();
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: false };
    board[localSquare(PlayerColor.Red, 7, 0)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: false };
    // Blue rook checks the Red king along its file.
    board[localSquare(PlayerColor.Red, 4, 5)] = { type: PieceType.Rook, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    const testState = { ...state, board, turn: PlayerColor.Red };

    expect(isPlayerInCheck(testState, PlayerColor.Red)).toBe(true);
    const moves = legalMoves(testState, PlayerColor.Red);
    expect(moves.some((m) => m.castle)).toBe(false);
  });

  it("castling is illegal if the king would pass through an attacked square", () => {
    const state = emptyState();
    const board = state.board.slice();
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: false };
    board[localSquare(PlayerColor.Red, 7, 0)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: false };
    // Blue rook attacks local file 5 (the square the king passes through en route to kingside castling).
    board[localSquare(PlayerColor.Red, 5, 5)] = { type: PieceType.Rook, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    const testState = { ...state, board, turn: PlayerColor.Red };

    const moves = legalMoves(testState, PlayerColor.Red);
    expect(moves.some((m) => m.castle === "kingside")).toBe(false);
  });

  it("castling succeeds once the path is clear and unattacked, for every orientation", () => {
    for (const color of ALL_COLORS) {
      const state = emptyState();
      const board = state.board.slice();
      board[localSquare(color, 4, 0)] = { type: PieceType.King, owner: color, hasMoved: false };
      board[localSquare(color, 7, 0)] = { type: PieceType.Rook, owner: color, hasMoved: false };
      for (const other of ALL_COLORS) {
        if (other !== color) board[localSquare(other, 4, 0)] = { type: PieceType.King, owner: other, hasMoved: true };
      }
      const testState = { ...state, board, turn: color };
      const moves = legalMoves(testState, color);
      expect(moves.some((m) => m.castle === "kingside")).toBe(true);
    }
  });
});
