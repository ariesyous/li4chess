import {
  GameState,
  PieceType,
  PlayerColor,
  createInitialState,
  localSquare,
  squareOf,
} from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { bestMove } from "../src/search.js";
import { chooseCpuMove } from "../src/index.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
}

function withKings(board: GameState["board"]) {
  const b = board.slice();
  for (const color of [PlayerColor.Red, PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green]) {
    if (!b.some((p) => p?.owner === color && p.type === PieceType.King)) {
      b[localSquare(color, 4, 0)] = { type: PieceType.King, owner: color, hasMoved: true };
    }
  }
  return b;
}

describe("bot search", () => {
  it("takes a free capture when one is available (depth 1)", () => {
    const state = emptyState();
    let board = state.board.slice();
    board[squareOf(5, 5)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(5, 8)] = { type: PieceType.Queen, owner: PlayerColor.Blue, hasMoved: true }; // undefended
    board = withKings(board);
    const testState: GameState = { ...state, board, turn: PlayerColor.Red };

    const move = bestMove(testState, PlayerColor.Red, { maxDepth: 1 });
    expect(move.to).toBe(squareOf(5, 8));
  });

  it("does not move a piece onto an undefended-capture square when safe alternatives exist (depth 2)", () => {
    const state = emptyState();
    let board = state.board.slice();
    board[squareOf(5, 5)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: true };
    // A Blue knight independently covers (5,8) — a normal rook destination along
    // file 5 — without threatening the rook's current square at all. The rook
    // has plenty of other safe moves (e.g. (5,6), (5,7), sideways along rank 5).
    board[squareOf(7, 7)] = { type: PieceType.Knight, owner: PlayerColor.Blue, hasMoved: true };
    board = withKings(board);
    const testState: GameState = { ...state, board, turn: PlayerColor.Red };

    const move = bestMove(testState, PlayerColor.Red, { maxDepth: 2 });
    expect(move.to).not.toBe(squareOf(5, 8));
  });

  it("chooseCpuMove returns a legal move at every difficulty level", () => {
    const state = createInitialState();
    for (const level of [1, 2] as const) {
      const move = chooseCpuMove(state, PlayerColor.Red, level);
      expect(move.piece.owner).toBe(PlayerColor.Red);
    }
  });
});
