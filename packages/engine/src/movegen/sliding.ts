import { fileOf, isOnBoard, rankOf, squareOf } from "../board.js";
import { Piece, PlayerColor } from "../types.js";
import { Vector } from "./directions.js";

/**
 * Destination squares reachable from `from` walking along `direction`,
 * stopping at (and including, if it's an enemy piece) the first occupied
 * square. Naturally respects the board's cutout corners since isOnBoard
 * simply halts the ray there.
 */
export function raySquares(
  from: number,
  direction: Vector,
  board: readonly (Piece | null)[],
  owner: PlayerColor
): number[] {
  const squares: number[] = [];
  let file = fileOf(from) + direction[0];
  let rank = rankOf(from) + direction[1];
  while (isOnBoard(file, rank)) {
    const square = squareOf(file, rank);
    const occupant = board[square];
    if (occupant === null) {
      squares.push(square);
    } else {
      if (occupant.owner !== owner) squares.push(square);
      break;
    }
    file += direction[0];
    rank += direction[1];
  }
  return squares;
}

export function slidingDestinations(
  from: number,
  directions: readonly Vector[],
  board: readonly (Piece | null)[],
  owner: PlayerColor
): number[] {
  const result: number[] = [];
  for (const direction of directions) {
    result.push(...raySquares(from, direction, board, owner));
  }
  return result;
}
