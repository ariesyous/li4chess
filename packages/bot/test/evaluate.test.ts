import { GameState, PieceType, PlayerColor, createInitialState, localSquare, squareOf } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { FULL_EVAL_WEIGHTS, MATERIAL_ONLY_WEIGHTS, evaluateFull, evaluateMaterial } from "../src/evaluate.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
}

describe("evaluate", () => {
  it("passive armies have no material, center, or pawn-advancement value", () => {
    for (const status of ["checkmated", "stalemated"] as const) {
      const base = emptyState();
      const state: GameState = { ...base, players: { ...base.players,
        [PlayerColor.Blue]: { ...base.players[PlayerColor.Blue], status } } };
      const board = state.board.slice();
      board[squareOf(5,5)] = { type:PieceType.Queen, owner:PlayerColor.Blue, hasMoved:true };
      board[squareOf(6,6)] = { type:PieceType.Pawn, owner:PlayerColor.Blue, hasMoved:true };
      const occupied = { ...state, board };
      expect(evaluateMaterial(occupied, PlayerColor.Red)).toBe(0);
      for (const term of ["material", "centerControl", "pawnAdvancement"] as const) {
        const weights = { ...MATERIAL_ONLY_WEIGHTS, material:0, [term]:1 };
        expect(evaluateFull(occupied, PlayerColor.Red, weights)).toBe(evaluateFull(state, PlayerColor.Red, weights));
      }
    }
  });
  it("evaluateMaterial is identical (and symmetric) for every color in the starting position", () => {
    // Each side starts with the same total material (39), and the score is
    // "mine minus the combined total of all 3 opponents" — so it's negative
    // for everyone at the start (39 - 3*39 = -78), but identically so.
    const state = createInitialState();
    const values = [PlayerColor.Red, PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green].map((color) =>
      evaluateMaterial(state, color)
    );
    expect(values.every((v) => v === values[0])).toBe(true);
    expect(values[0]).toBe(39 - 3 * 39);
  });

  it("evaluateMaterial rewards having more material than the combined opponents", () => {
    const state = emptyState();
    const board = state.board.slice();
    board[squareOf(5, 5)] = { type: PieceType.Queen, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(5, 8)] = { type: PieceType.Pawn, owner: PlayerColor.Blue, hasMoved: true };
    const testState: GameState = { ...state, board };
    expect(evaluateMaterial(testState, PlayerColor.Red)).toBe(9 - 1);
    expect(evaluateMaterial(testState, PlayerColor.Blue)).toBe(1 - 9);
  });

  it("evaluateFull scores a position with a hanging opponent queen higher than one without", () => {
    const base = emptyState();
    const board = base.board.slice();
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    board[squareOf(5, 5)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: true };

    const withHangingQueen = board.slice();
    withHangingQueen[squareOf(5, 8)] = { type: PieceType.Queen, owner: PlayerColor.Blue, hasMoved: true };
    const withSafeQueen = board.slice();
    withSafeQueen[squareOf(9, 9)] = { type: PieceType.Queen, owner: PlayerColor.Blue, hasMoved: true };

    const scoreHanging = evaluateFull({ ...base, board: withHangingQueen }, PlayerColor.Red, FULL_EVAL_WEIGHTS);
    const scoreSafe = evaluateFull({ ...base, board: withSafeQueen }, PlayerColor.Red, FULL_EVAL_WEIGHTS);
    expect(scoreHanging).toBeGreaterThan(scoreSafe);
  });
});
