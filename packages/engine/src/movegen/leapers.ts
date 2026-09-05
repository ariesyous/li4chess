import { fileOf, isOnBoard, rankOf, squareOf } from "../board.js";
import { Piece, PlayerColor } from "../types.js";
import { Vector } from "./directions.js";

/** Single-step destinations (knight or king) — lands anywhere on-board that isn't occupied by own piece. */
export function leaperDestinations(
  from: number,
  deltas: readonly Vector[],
  board: readonly (Piece | null)[],
  owner: PlayerColor
): number[] {
  const result: number[] = [];
  const fromFile = fileOf(from);
  const fromRank = rankOf(from);
  for (const [df, dr] of deltas) {
    const file = fromFile + df;
    const rank = fromRank + dr;
    if (!isOnBoard(file, rank)) continue;
    const square = squareOf(file, rank);
    const occupant = board[square];
    if (occupant === null || occupant.owner !== owner) {
      result.push(square);
    }
  }
  return result;
}
