import { ALL_COLORS, GameState, Move, Piece, PieceType, PlayerColor } from "../types.js";
import { kingPathSquares } from "../movegen/castling.js";
import { pseudoLegalMoves } from "../movegen/index.js";
import { isSquareAttacked } from "./attacks.js";
import { applyMoveToBoard } from "./boardOps.js";
import { activePlayersExcept, isInCheck } from "./check.js";

/**
 * Castling path restrictions, own-king safety, and active-king non-capture.
 * Returns the resulting board so callers don't rebuild it, or null if illegal.
 */
function boardAfterIfLegal(
  state: GameState,
  move: Move,
  color: PlayerColor,
  opponents: readonly PlayerColor[]
): readonly (Piece | null)[] | null {
  const target = state.board[move.to];
  if (target?.type === PieceType.King && state.players[target.owner].status === "active") return null;
  if (move.castle !== undefined) {
    if (isInCheck(state.board, color, opponents)) return null;
    const path = kingPathSquares(color, move.castle);
    if (path.some((square) => opponents.some((opp) => isSquareAttacked(state.board, square, opp)))) {
      return null;
    }
  }

  const resultingBoard = applyMoveToBoard(state.board, move);
  return isInCheck(resultingBoard, color, opponents) ? null : resultingBoard;
}

/**
 * All fully legal moves for `color` (or state.turn if omitted): pseudo-legal,
 * minus any that leave the mover's own king in check. Surviving moves are
 * annotated with `isCheck`: the colors of every OTHER active player whose
 * king this move puts in check (0-3 entries, since one move can check
 * multiple opponents at once).
 */
export function legalMoves(state: GameState, color: PlayerColor = state.turn): Move[] {
  const opponents = activePlayersExcept(state, color);
  const result: Move[] = [];

  for (const move of pseudoLegalMoves(state, color)) {
    const resultingBoard = boardAfterIfLegal(state, move, color, opponents);
    if (resultingBoard === null) continue;

    // Report every opponent left in check after this move (not only ones this
    // specific move directly attacks) — with fixed turn rotation, a king can be
    // in check from an earlier discovered attack while a different player's
    // turn intervenes, and callers (UI, checkmate detection) need to see that.
    const isCheck = opponents.filter((opp) => isInCheck(resultingBoard, opp, activePlayersExcept(state, opp)));
    result.push({ ...move, isCheck });
  }

  return result;
}

/**
 * Whether `color` has any legal move at all — the checkmate/stalemate question,
 * without generating the answer.
 *
 * Equivalent to `legalMoves(state, color).length > 0`, but stops at the first
 * legal move and skips the `isCheck` annotation, which is by far the expensive
 * part: annotating costs an attack scan per opponent per move, and every
 * applyMove asks this question about the next player in rotation. Building the
 * full annotated list to then only read its length made a single applyMove cost
 * as much as a full move generation.
 */
export function hasLegalMove(state: GameState, color: PlayerColor = state.turn): boolean {
  const opponents = activePlayersExcept(state, color);
  for (const move of pseudoLegalMoves(state, color)) {
    if (boardAfterIfLegal(state, move, color, opponents) !== null) return true;
  }
  return false;
}

/** All legal moves for every currently-active player (not just the side to move) — used by checkmate/stalemate detection. */
export function legalMovesFor(state: GameState, color: PlayerColor): Move[] {
  return legalMoves(state, color);
}

export function allActiveColors(state: GameState): PlayerColor[] {
  return ALL_COLORS.filter((c) => state.players[c].status === "active");
}
