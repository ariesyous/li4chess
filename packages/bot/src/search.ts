import { GameState, Move, PIECE_VALUES, PlayerColor, applyMove, gamePhase, legalMoves } from "@li4chess/engine";
import { evaluateMaterial } from "./evaluate.js";

export type EvaluateFn = (state: GameState, botColor: PlayerColor) => number;

export interface SearchOptions {
  readonly maxDepth: number;
  readonly evaluate?: EvaluateFn;
}

export interface ScoredMove {
  readonly move: Move;
  readonly value: number;
}

/** Cheap move-ordering heuristic (captures first, ranked by captured piece value) to help alpha-beta prune earlier. */
function orderMoves(moves: readonly Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const scoreA = (a.captured ? PIECE_VALUES[a.captured.type] : 0) + a.isCheck.length * 0.5;
    const scoreB = (b.captured ? PIECE_VALUES[b.captured.type] : 0) + b.isCheck.length * 0.5;
    return scoreB - scoreA;
  });
}

/**
 * Paranoid alpha-beta: every node is either the bot's own turn (maximizing)
 * or some other player's turn (minimizing, since all opponents are treated
 * as one coalition working against the bot) — this collapses the 4-player
 * search to standard 2-player minimax, so ordinary alpha-beta pruning applies
 * unmodified. See docs/rules-spec.md / the project plan for why paranoid was
 * chosen over max^n for v1.
 */
function alphaBeta(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  botColor: PlayerColor,
  evaluate: EvaluateFn
): number {
  if (depth === 0 || gamePhase(state) === "finished") {
    return evaluate(state, botColor);
  }

  const moves = orderMoves(legalMoves(state, state.turn));
  const maximizing = state.turn === botColor;
  let value = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const child = applyMove(state, move);
    const childValue = alphaBeta(child, depth - 1, alpha, beta, botColor, evaluate);
    if (maximizing) {
      if (childValue > value) value = childValue;
      if (value > alpha) alpha = value;
    } else {
      if (childValue < value) value = childValue;
      if (value < beta) beta = value;
    }
    if (alpha >= beta) break;
  }

  return value;
}

/** Scores every legal move for `botColor` at the given search depth, best first. */
export function rankMoves(state: GameState, botColor: PlayerColor, options: SearchOptions): ScoredMove[] {
  const evaluate = options.evaluate ?? evaluateMaterial;
  const moves = orderMoves(legalMoves(state, botColor));
  if (moves.length === 0) {
    throw new Error(`rankMoves called for ${botColor} with no legal moves`);
  }

  let alpha = -Infinity;
  const beta = Infinity;
  const scored: ScoredMove[] = [];

  for (const move of moves) {
    const child = applyMove(state, move);
    const value = alphaBeta(child, options.maxDepth - 1, alpha, beta, botColor, evaluate);
    scored.push({ move, value });
    if (value > alpha) alpha = value;
  }

  scored.sort((a, b) => b.value - a.value);
  return scored;
}

/** Picks the single best legal move for `botColor` at the given search depth. */
export function bestMove(state: GameState, botColor: PlayerColor, options: SearchOptions): Move {
  return rankMoves(state, botColor, options)[0].move;
}
