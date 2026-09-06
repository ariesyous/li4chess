import { findKingSquare, isSquareAttacked, pieceAttacksSquare } from "./attacks.js";
import { ALL_COLORS, GameState, Piece, PlayerColor } from "../types.js";
import { hasLiveKing,isLivePiece } from "./live.js";

/** True iff `color`'s king is currently attacked by any other active player, on the given board. */
export function isInCheck(
  board: readonly (Piece | null)[],
  color: PlayerColor,
  activeOpponents: readonly PlayerColor[]
): boolean {
  const kingSquare = findKingSquare(board, color);
  if (kingSquare === null) return false; // already eliminated, no king to check
  return activeOpponents.some((opponent) => isSquareAttacked(board, kingSquare, opponent));
}

export function activePlayersExcept(state: GameState, color: PlayerColor): PlayerColor[] {
  return ALL_COLORS.filter((c) => c !== color && hasLiveKing(state,c));
}

export function isPlayerInCheck(state: GameState, color: PlayerColor): boolean {
  const king = findKingSquare(state.board,color);
  return king !== null && isAttackedByLiveOpponent(state,king,color);
}

export function isAttackedByLiveOpponent(state: GameState,square: number,color: PlayerColor): boolean {
  return state.board.some((piece,from) => piece !== null && piece.owner !== color &&
    isLivePiece(state,piece) && pieceAttacksSquare(state.board,from,square));
}
