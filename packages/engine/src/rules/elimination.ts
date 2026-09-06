import { localSquare } from "../board.js";
import { ALL_COLORS, CastlingRights, GameResult, PieceType, Piece, PlayerColor, PlayerState } from "../types.js";

/** Retains only existing rights backed by active, unmoved own home pieces.
 * Board occupancy can revoke rights, but must never restore a revoked right.
 */
export function recomputeCastlingRights(
  board: readonly (Piece | null)[],
  color: PlayerColor,
  previous: CastlingRights,
  status: PlayerState["status"]
): CastlingRights {
  if (status !== "active") return { kingside: false, queenside: false };
  const king = board[localSquare(color, 4, 0)];
  const kingReady = king !== null && king.owner === color && king.type === PieceType.King && !king.hasMoved;
  const queensideRook = board[localSquare(color, 0, 0)];
  const kingsideRook = board[localSquare(color, 7, 0)];
  return {
    queenside: previous.queenside && kingReady && queensideRook !== null && queensideRook.owner === color && queensideRook.type === PieceType.Rook && !queensideRook.hasMoved,
    kingside: previous.kingside && kingReady && kingsideRook !== null && kingsideRook.owner === color && kingsideRook.type === PieceType.Rook && !kingsideRook.hasMoved,
  };
}

export function countActive(players: Readonly<Record<PlayerColor, PlayerState>>): number {
  return ALL_COLORS.filter((c) => players[c].status === "active").length;
}

/** Points alone determine placement. Stable seat ordering only displays ties. */
export function computeGameResult(players: Readonly<Record<PlayerColor, PlayerState>>): GameResult {
  const ranked = [...ALL_COLORS].sort((a,b)=>players[b].score-players[a].score || a-b);
  const placements = ranked.map(color=>{
    const score=players[color].score;
    const higher=ALL_COLORS.filter(c=>players[c].score>score).length;
    const tied=ALL_COLORS.filter(c=>players[c].score===score).length;
    return { color,score,place:higher+1,meanRank:higher+(tied+1)/2 };
  });
  return { reason:"elimination",placements,winner:placements.filter(p=>p.place===1).length===1 ? placements[0].color : null };
}

/** The draw trigger changes the reason, while final points still determine rank. */
export function computeDrawResult(players: Readonly<Record<PlayerColor, PlayerState>>,reason:"repetition" | "insufficient-material" | "fifty-move"="repetition"): GameResult {
  return { ...computeGameResult(players),reason };
}
