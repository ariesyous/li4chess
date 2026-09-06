import { VALID_SQUARES } from "../board.js";
import {
  BISHOP_DIRECTIONS,
  KING_DELTAS,
  KNIGHT_DELTAS,
  QUEEN_DIRECTIONS,
  ROOK_DIRECTIONS,
  addVectors,
  forwardVector,
  leaperDestinations,
  raySquares,
  sideVector,
} from "../movegen/index.js";
import { fileOf, isOnBoard, rankOf, squareOf } from "../board.js";
import { Piece, PieceType, PlayerColor } from "../types.js";

/** The two squares a pawn of `color` at `square` threatens (regardless of what's currently there). */
export function pawnAttackSquares(square: number, color: PlayerColor): number[] {
  const forward = forwardVector(color);
  const side = sideVector(color);
  const file = fileOf(square);
  const rank = rankOf(square);
  const squares: number[] = [];
  for (const sign of [1, -1] as const) {
    const [df, dr] = addVectors(forward, side, sign);
    const f = file + df;
    const r = rank + dr;
    if (isOnBoard(f, r)) squares.push(squareOf(f, r));
  }
  return squares;
}

/** True iff any piece owned by `byColor` attacks `square` on the given board. */
export function isSquareAttacked(
  board: readonly (Piece | null)[],
  square: number,
  byColor: PlayerColor
): boolean {
  for (const from of VALID_SQUARES) {
    const piece = board[from];
    if (piece === null || piece.owner !== byColor) continue;
    if (pieceAttacksSquare(board, from, square)) return true;
  }
  return false;
}

/** Geometry for one specified piece, retaining every intervening blocker. */
export function pieceAttacksSquare(board: readonly (Piece | null)[], from: number, square: number): boolean {
  const piece = board[from];
  if (!piece) return false;
  const byColor = piece.owner;
  switch (piece.type) {
    case PieceType.Pawn:
      if (pawnAttackSquares(from, byColor).includes(square)) return true;
      break;
    case PieceType.Knight:
      if (leaperDestinations(from, KNIGHT_DELTAS, board, byColor).includes(square)) return true;
      break;
    case PieceType.King:
      if (leaperDestinations(from, KING_DELTAS, board, byColor).includes(square)) return true;
      break;
    case PieceType.Bishop:
      for (const dir of BISHOP_DIRECTIONS) {
        if (raySquares(from, dir, board, byColor).includes(square)) return true;
      }
      break;
    case PieceType.Rook:
      for (const dir of ROOK_DIRECTIONS) {
        if (raySquares(from, dir, board, byColor).includes(square)) return true;
      }
      break;
    case PieceType.Queen:
      for (const dir of QUEEN_DIRECTIONS) {
        if (raySquares(from, dir, board, byColor).includes(square)) return true;
      }
      break;
  }
  return false;
}

export function findKingSquare(
  board: readonly (Piece | null)[],
  color: PlayerColor
): number | null {
  for (const square of VALID_SQUARES) {
    const piece = board[square];
    if (piece !== null && piece.owner === color && piece.type === PieceType.King) return square;
  }
  return null;
}

/**
 * Every square attacked by `byColor`, as a 0/1 map indexed by square.
 *
 * Equivalent to calling isSquareAttacked for every square, but computed in a
 * single sweep outward from each of `byColor`'s pieces instead of a separate
 * inward scan per query. Callers that need many attack queries against the
 * same board (evaluation, king-confinement checks) should build one of these
 * rather than calling isSquareAttacked in a loop — the latter re-walks all 160
 * squares and re-casts every ray on each call.
 *
 * Semantics deliberately match isSquareAttacked exactly, including its quirk
 * that pawns "attack" their own occupied diagonals while other piece types do
 * not (see pawnAttackSquares, which ignores occupancy). test/attacks.test.ts
 * pins the two implementations together.
 */
export function attackMap(
  board: readonly (Piece | null)[],
  byColor: PlayerColor,
  include: (piece: Piece) => boolean = () => true
): Uint8Array {
  const map = new Uint8Array(board.length);
  const mark = (squares: readonly number[]): void => {
    for (const square of squares) map[square] = 1;
  };

  for (const from of VALID_SQUARES) {
    const piece = board[from];
    if (piece === null || piece.owner !== byColor || !include(piece)) continue;

    switch (piece.type) {
      case PieceType.Pawn:
        mark(pawnAttackSquares(from, byColor));
        break;
      case PieceType.Knight:
        mark(leaperDestinations(from, KNIGHT_DELTAS, board, byColor));
        break;
      case PieceType.King:
        mark(leaperDestinations(from, KING_DELTAS, board, byColor));
        break;
      case PieceType.Bishop:
        for (const dir of BISHOP_DIRECTIONS) mark(raySquares(from, dir, board, byColor));
        break;
      case PieceType.Rook:
        for (const dir of ROOK_DIRECTIONS) mark(raySquares(from, dir, board, byColor));
        break;
      case PieceType.Queen:
        for (const dir of QUEEN_DIRECTIONS) mark(raySquares(from, dir, board, byColor));
        break;
    }
  }

  return map;
}
