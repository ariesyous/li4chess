import { ALL_COLORS, GameState, PieceType } from "../types.js";

/**
 * A string key identifying "the same position" for threefold-repetition
 * purposes: board occupants (type+owner and pawn first-move entitlement), whose
 * turn it is, castling rights, all pending en-passant rights, and player status
 * (active/checkmated/stalemated matters here too, since a stalemated
 * player's frozen-but-present pieces change the future game tree the same
 * board+turn wouldn't otherwise capture).
 */
export function positionKey(state: GameState): string {
  const boardPart = state.board.map((p) => (p ? `${p.owner}${p.type}${p.promotedFrom ?? ""}${p.type === PieceType.Pawn ? +p.hasMoved : ""}` : ".")).join("");
  const castlingPart = ALL_COLORS.map(
    (c) => `${state.castlingRights[c].kingside ? 1 : 0}${state.castlingRights[c].queenside ? 1 : 0}`
  ).join("");
  const statusPart = ALL_COLORS.map((c) => state.players[c].status[0]).join("");
  const epPart = JSON.stringify([...state.enPassantRights]
    .sort((a, b) => a.target - b.target || a.pawnSquare - b.pawnSquare || a.pawnOwner - b.pawnOwner)
    .map(right => [right.target, right.pawnSquare, right.pawnOwner, [...right.eligiblePlayers].sort((a, b) => a - b)]));
  return `${boardPart}|${state.turn}|${castlingPart}|${epPart}|${statusPart}`;
}

export const REPETITION_DRAW_COUNT = 3;
