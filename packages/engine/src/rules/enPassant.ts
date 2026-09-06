import { boardToLocal, fileOf, rankOf, squareOf } from "../board.js";
import { forwardVector } from "../movegen/directions.js";
import { ALL_COLORS, EnPassantRight, GameState, Move, Piece, PieceType } from "../types.js";
import { pawnAttackSquares } from "./attacks.js";

/** Retain pending targets even if their pawn's owner died: passive EP capture
 * is allowed. Only active capturers keep rights; gone/replaced pawns do not.
 */
export function remainingEnPassantRights(state: Pick<GameState, "board" | "players" | "enPassantRights">): EnPassantRight[] {
  return state.enPassantRights.flatMap(right => {
    const pawn = state.board[right.pawnSquare];
    if (pawn?.type !== PieceType.Pawn || pawn.owner !== right.pawnOwner) return [];
    const eligiblePlayers = right.eligiblePlayers.filter(c => state.players[c].status === "active");
    return eligiblePlayers.length ? [{ ...right, eligiblePlayers }] : [];
  });
}

export function enPassantRightsAfterMove(state: GameState, board: readonly (Piece | null)[], move: Move): EnPassantRight[] {
  const enPassantRights = state.enPassantRights
    .filter(right => right.pawnSquare !== move.from && right.pawnSquare !== move.to && right.pawnSquare !== move.enPassantCapture)
    .map(right => ({ ...right, eligiblePlayers: right.eligiblePlayers.filter(c => c !== move.piece.owner) }));
  const remaining = remainingEnPassantRights({ board, players: state.players, enPassantRights });
  if (move.piece.type !== PieceType.Pawn || move.captured || move.enPassantCapture !== undefined) return remaining;
  const [, fromRank] = boardToLocal(move.piece.owner, fileOf(move.from), rankOf(move.from));
  const [, toRank] = boardToLocal(move.piece.owner, fileOf(move.to), rankOf(move.to));
  if (toRank - fromRank !== 2) return remaining;

  const [df, dr] = forwardVector(move.piece.owner);
  const target = squareOf(fileOf(move.from) + df, rankOf(move.from) + dr);
  const eligiblePlayers = ALL_COLORS.filter(color => color !== move.piece.owner && state.players[color].status === "active" &&
    board.some((piece, square) => piece?.type === PieceType.Pawn && piece.owner === color && pawnAttackSquares(square, color).includes(target)));
  if (eligiblePlayers.length) remaining.push({ target, pawnSquare: move.to, pawnOwner: move.piece.owner, eligiblePlayers });
  return remaining;
}
