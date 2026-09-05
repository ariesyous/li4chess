import { ALL_COLORS, GameState, Move, PlayerColor } from "../types.js";
import { kingPathSquares } from "../movegen/castling.js";
import { pseudoLegalMoves } from "../movegen/index.js";
import { isSquareAttacked } from "./attacks.js";
import { applyMoveToBoard } from "./boardOps.js";
import { activePlayersExcept, isInCheck } from "./check.js";

/**
 * All fully legal moves for `color` (or state.turn if omitted): pseudo-legal,
 * minus any that leave the mover's own king in check. Surviving moves are
 * annotated with `isCheck`: the colors of every OTHER active player whose
 * king this move puts in check (0-3 entries, since one move can check
 * multiple opponents at once).
 */
export function legalMoves(state: GameState, color: PlayerColor = state.turn): Move[] {
  const opponents = activePlayersExcept(state, color);
  const pseudo = pseudoLegalMoves(state, color);
  const result: Move[] = [];

  for (const move of pseudo) {
    if (move.castle !== undefined) {
      if (isInCheck(state.board, color, opponents)) continue;
      const path = kingPathSquares(color, move.castle);
      if (path.some((square) => opponents.some((opp) => isSquareAttacked(state.board, square, opp)))) {
        continue;
      }
    }

    const resultingBoard = applyMoveToBoard(state.board, move);
    if (isInCheck(resultingBoard, color, opponents)) continue;

    // Report every opponent left in check after this move (not only ones this
    // specific move directly attacks) — with fixed turn rotation, a king can be
    // in check from an earlier discovered attack while a different player's
    // turn intervenes, and callers (UI, checkmate detection) need to see that.
    const isCheck = opponents.filter((opp) => isInCheck(resultingBoard, opp, activePlayersExcept(state, opp)));
    result.push({ ...move, isCheck });
  }

  return result;
}

/** All legal moves for every currently-active player (not just the side to move) — used by checkmate/stalemate detection. */
export function legalMovesFor(state: GameState, color: PlayerColor): Move[] {
  return legalMoves(state, color);
}

export function allActiveColors(state: GameState): PlayerColor[] {
  return ALL_COLORS.filter((c) => state.players[c].status === "active");
}
