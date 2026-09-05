import { findKingSquare, isSquareAttacked } from "./attacks.js";
import { ALL_COLORS, GameState, Piece, PlayerColor } from "../types.js";

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
  return ALL_COLORS.filter((c) => c !== color && state.players[c].status === "active");
}

export function isPlayerInCheck(state: GameState, color: PlayerColor): boolean {
  return isInCheck(state.board, color, activePlayersExcept(state, color));
}
