import { localToBoard } from "../board.js";
import { PlayerColor } from "../types.js";

export type Vector = readonly [number, number]; // [deltaFile, deltaRank]

export const ROOK_DIRECTIONS: readonly Vector[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const BISHOP_DIRECTIONS: readonly Vector[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export const QUEEN_DIRECTIONS: readonly Vector[] = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];

export const KNIGHT_DELTAS: readonly Vector[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

export const KING_DELTAS: readonly Vector[] = QUEEN_DIRECTIONS;

/**
 * The absolute (file, rank) direction a player's pawns advance in — i.e. the
 * direction of increasing local rank in that player's own frame.
 */
export function forwardVector(color: PlayerColor): Vector {
  const [f0, r0] = localToBoard(color, 0, 0);
  const [f1, r1] = localToBoard(color, 0, 1);
  return [f1 - f0, r1 - r0];
}

/**
 * The absolute (file, rank) direction of increasing local file (queenside ->
 * kingside) in a player's own frame. Perpendicular to forwardVector; used to
 * build pawn capture diagonals as forward +/- side, orientation-agnostically.
 */
export function sideVector(color: PlayerColor): Vector {
  const [f0, r0] = localToBoard(color, 0, 0);
  const [f1, r1] = localToBoard(color, 1, 0);
  return [f1 - f0, r1 - r0];
}

export function addVectors(a: Vector, b: Vector, scaleB = 1): Vector {
  return [a[0] + b[0] * scaleB, a[1] + b[1] * scaleB];
}
