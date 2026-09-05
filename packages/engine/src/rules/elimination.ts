import { localSquare } from "../board.js";
import { ALL_COLORS, CastlingRights, GameResult, PieceType, Piece, PlayerColor, PlayerState } from "../types.js";

/** Removes all pieces owned by `color` from the board (checkmate: king and remaining pieces vanish). */
export function removeAllPiecesOf(
  board: readonly (Piece | null)[],
  color: PlayerColor
): (Piece | null)[] {
  return board.map((piece) => (piece !== null && piece.owner === color ? null : piece));
}

/** Recomputes castling rights for `color` directly from board state (unmoved king/rooks on their home squares). */
export function recomputeCastlingRights(
  board: readonly (Piece | null)[],
  color: PlayerColor
): CastlingRights {
  const king = board[localSquare(color, 4, 0)];
  const kingReady = king !== null && king.type === PieceType.King && !king.hasMoved;
  const queensideRook = board[localSquare(color, 0, 0)];
  const kingsideRook = board[localSquare(color, 7, 0)];
  return {
    queenside: kingReady && queensideRook !== null && queensideRook.type === PieceType.Rook && !queensideRook.hasMoved,
    kingside: kingReady && kingsideRook !== null && kingsideRook.type === PieceType.Rook && !kingsideRook.hasMoved,
  };
}

export function countActive(players: Readonly<Record<PlayerColor, PlayerState>>): number {
  return ALL_COLORS.filter((c) => players[c].status === "active").length;
}

/**
 * Ranks eliminated/stalemated players by placement: the sole remaining active
 * player is 1st; among the rest, a later elimination turn is a better
 * placement, ties broken by score, then by fixed seat order (Red > Blue > Yellow > Green).
 */
export function computeGameResult(players: Readonly<Record<PlayerColor, PlayerState>>): GameResult {
  const active = ALL_COLORS.filter((c) => players[c].status === "active");
  const winner = active.length === 1 ? active[0] : null;

  const ranked = [...ALL_COLORS].sort((a, b) => {
    const pa = players[a];
    const pb = players[b];
    if (pa.status === "active" && pb.status !== "active") return -1;
    if (pb.status === "active" && pa.status !== "active") return 1;
    if (pa.status === "active" && pb.status === "active") return a - b; // seat order tie-break (should not occur: >1 active)
    const turnA = pa.eliminatedOnTurn ?? -Infinity;
    const turnB = pb.eliminatedOnTurn ?? -Infinity;
    if (turnA !== turnB) return turnB - turnA; // later elimination = better placement
    if (pa.score !== pb.score) return pb.score - pa.score;
    return a - b; // seat order, Red(0) first
  });

  return {
    winner,
    reason: "elimination",
    placements: ranked.map((color, index) => ({
      color,
      place: index + 1,
      score: players[color].score,
    })),
  };
}

/**
 * A draw by threefold repetition: every still-active player ties for 1st
 * (nobody was eliminated, so nobody "won"), followed by already-eliminated
 * players ranked exactly as in computeGameResult.
 */
export function computeDrawResult(players: Readonly<Record<PlayerColor, PlayerState>>): GameResult {
  const active = [...ALL_COLORS].filter((c) => players[c].status === "active").sort((a, b) => a - b);
  const eliminated = [...ALL_COLORS]
    .filter((c) => players[c].status !== "active")
    .sort((a, b) => {
      const pa = players[a];
      const pb = players[b];
      const turnA = pa.eliminatedOnTurn ?? -Infinity;
      const turnB = pb.eliminatedOnTurn ?? -Infinity;
      if (turnA !== turnB) return turnB - turnA;
      if (pa.score !== pb.score) return pb.score - pa.score;
      return a - b;
    });

  return {
    winner: null,
    reason: "repetition",
    placements: [
      ...active.map((color) => ({ color, place: 1, score: players[color].score })),
      ...eliminated.map((color, index) => ({
        color,
        place: active.length + 1 + index,
        score: players[color].score,
      })),
    ],
  };
}
