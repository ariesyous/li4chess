import {
  GameState,
  PieceType,
  PlayerColor,
  applyMove,
  createInitialState,
  localSquare,
  positionKey,
  squareOf,
} from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { chooseCpuMove } from "../src/index.js";
import { evaluateFull } from "../src/evaluate.js";
import { rankMoves } from "../src/search.js";

const evaluate = (s: GameState, c: PlayerColor) => evaluateFull(s, c);

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board, positionCounts: {} };
}

function withOtherKings(state: GameState, exclude: PlayerColor): GameState {
  const board = state.board.slice();
  for (const color of [PlayerColor.Red, PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green]) {
    if (color !== exclude) board[localSquare(color, 4, 0)] = { type: PieceType.King, owner: color, hasMoved: true };
  }
  return { ...state, board };
}

describe("bot: avoids pointless shuffling", () => {
  it("ranks advancing a pawn above a neutral king move of otherwise-equal tactical value", () => {
    let state = emptyState();
    let board = state.board.slice();
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(3, 6)] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: true };
    state = withOtherKings({ ...state, board, turn: PlayerColor.Red }, PlayerColor.Red);

    const ranked = rankMoves(state, PlayerColor.Red, { maxDepth: 1, evaluate });
    const pawnPush = ranked.find((r) => r.move.piece.type === PieceType.Pawn);
    const kingMove = ranked.find((r) => r.move.piece.type === PieceType.King);
    expect(pawnPush).toBeDefined();
    expect(kingMove).toBeDefined();
    expect(pawnPush!.value).toBeGreaterThan(kingMove!.value);
  });

  it("chooseCpuMove prefers a fresh move over one that recreates a position already reached this game", () => {
    let state = emptyState();
    let board = state.board.slice();
    // A knight with exactly two reachable squares, shuffling between them, plus a
    // king that has a third, never-before-seen square available too.
    board[squareOf(6, 6)] = { type: PieceType.Knight, owner: PlayerColor.Red, hasMoved: true };
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    state = withOtherKings({ ...state, board, turn: PlayerColor.Red }, PlayerColor.Red);

    // Play the knight out and back once, so its "away" square is already a visited position.
    const out = rankMoves(state, PlayerColor.Red, { maxDepth: 1, evaluate }).find((r) => r.move.piece.type === PieceType.Knight)!.move;
    let afterOut = applyMove(state, out);
    const back = rankMoves(afterOut, PlayerColor.Red, { maxDepth: 1 }).find(
      (r) => r.move.piece.type === PieceType.Knight && r.move.to === out.from
    );
    expect(back).toBeDefined();

    // Give Red's opponents (Blue) a no-op-ish single king shuffle so it's Red's turn again quickly.
    // Simpler: directly simulate — apply the "back" move so we're at the original position + 2 plies,
    // with that exact position now recorded once already (count 1 after the very first occurrence).
    let afterBack = applyMove(afterOut, back!.move);

    // Now repeat the whole out-and-back once more via chooseCpuMove and confirm it does NOT
    // choose to shuffle the knight right back to a square that would recreate a seen position,
    // when the king has a legal alternative that doesn't.
    const chosen = chooseCpuMove(afterBack, PlayerColor.Red, 4, () => 0.99);
    const resultingKey = positionKey(applyMove(afterBack, chosen));
    expect(afterBack.positionCounts[resultingKey] ?? 0).toBe(0);
  });
});
