import { rookSquaresForCastle } from "../movegen/castling.js";
import { Move, Piece } from "../types.js";

/** Pure board transform for a single move — no turn/castling-rights/elimination bookkeeping. */
export function applyMoveToBoard(
  board: readonly (Piece | null)[],
  move: Move
): (Piece | null)[] {
  const next = board.slice();
  const movedPiece: Piece = {
    ...move.piece,
    type: move.promotion ?? move.piece.type,
    hasMoved: true,
  };

  next[move.from] = null;
  next[move.to] = movedPiece;

  if (move.enPassantCapture !== undefined) {
    next[move.enPassantCapture] = null;
  }

  if (move.castle !== undefined) {
    const { from: rookFrom, to: rookTo } = rookSquaresForCastle(move.piece.owner, move.castle);
    const rook = next[rookFrom];
    next[rookFrom] = null;
    next[rookTo] = rook ? { ...rook, hasMoved: true } : null;
  }

  return next;
}
