import { expect } from "vitest";
import { ALL_COLORS, GameState, Piece, PieceType, PlayerColor, applyMove, createInitialState, legalMoves, localSquare } from "../src/index.js";

export const { Pawn: P, Knight: N, Bishop: B, Rook: R, Queen: Q, King: K } = PieceType;
export const colorAt = (rotation: PlayerColor, offset: number): PlayerColor => ((rotation + offset) % 4) as PlayerColor;
// Rotate explicit Red-frame absolute coordinates through the shared transform.
export const sq = (rotation: PlayerColor, file: number, rank: number) => localSquare(rotation, file - 3, rank);
export type Placement = readonly [file: number, rank: number, type: PieceType, owner: PlayerColor, moved?: boolean];

export function position(rotation: PlayerColor, pieces: readonly Placement[], turn = 0): GameState {
  const base = createInitialState();
  const board: (Piece | null)[] = Array(196).fill(null);
  for (const [f, r, type, owner, moved = true] of pieces) {
    const square = sq(rotation, f, r);
    expect(board[square], `duplicate fixture square ${square}`).toBeNull();
    board[square] = { type, owner: colorAt(rotation, owner), hasMoved: moved };
  }
  return { ...base, board, turn: colorAt(rotation, turn), positionCounts: {},
    castlingRights: Object.fromEntries(ALL_COLORS.map(c => [c, { kingside: false, queenside: false }])) as GameState["castlingRights"] };
}

export const kings: readonly Placement[] = [[7, 0, K, 0], [0, 6, K, 1], [6, 13, K, 2], [13, 7, K, 3]];

export function play(state: GameState, rotation: PlayerColor, from: readonly [number, number], to: readonly [number, number]): GameState {
  const move = legalMoves(state).find(m => m.from === sq(rotation, ...from) && m.to === sq(rotation, ...to));
  expect(move, `${PlayerColor[state.turn]}: ${from} -> ${to}`).toBeDefined();
  const before = JSON.stringify(state);
  const after = applyMove(state, move!);
  expect(JSON.stringify(state)).toBe(before);
  return after;
}

export function quiet(state: GameState, rotation: PlayerColor): GameState {
  const seat = (state.turn - rotation + 4) % 4;
  const moves = [ [[7, 0], [8, 0]], [[0, 6], [0, 7]], [[6, 13], [6, 12]], [[13, 7], [12, 7]] ] as const;
  return play(state, rotation, moves[seat][0], moves[seat][1]);
}
