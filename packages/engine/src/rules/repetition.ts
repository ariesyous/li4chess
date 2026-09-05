import { ALL_COLORS, GameState } from "../types.js";

/**
 * A string key identifying "the same position" for threefold-repetition
 * purposes: board occupants (type+owner, not `hasMoved` — its only game
 * effect is castling rights, already captured separately below), whose turn
 * it is, castling rights, the en passant target, and each player's status
 * (active/checkmated/stalemated matters here too, since a stalemated
 * player's frozen-but-present pieces change the future game tree the same
 * board+turn wouldn't otherwise capture).
 */
export function positionKey(state: GameState): string {
  const boardPart = state.board.map((p) => (p ? `${p.owner}${p.type}` : ".")).join("");
  const castlingPart = ALL_COLORS.map(
    (c) => `${state.castlingRights[c].kingside ? 1 : 0}${state.castlingRights[c].queenside ? 1 : 0}`
  ).join("");
  const statusPart = ALL_COLORS.map((c) => state.players[c].status[0]).join("");
  return `${boardPart}|${state.turn}|${castlingPart}|${state.enPassantTarget ?? -1}|${statusPart}`;
}

export const REPETITION_DRAW_COUNT = 3;
