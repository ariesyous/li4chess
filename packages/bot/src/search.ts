import { GameState, Move, PIECE_VALUES, PlayerColor, advanceWalkingKing, applyMove, gamePhase, legalMoves,claimSecuresSoleWin,claimWin } from "@li4chess/engine";
import { MATE_THRESHOLD, evaluateMaterial } from "./evaluate.js";

export type EvaluateFn = (state: GameState, botColor: PlayerColor) => number;

export interface SearchOptions {
  readonly maxDepth: number;
  readonly evaluate?: EvaluateFn;
  /** Shared across iterations/refinement; polling does not consume a node. */
  readonly budget?: { check: () => void; visit: () => void };
}

export interface ScoredMove {
  readonly move: Move;
  readonly value: number;
}

/** Two killer moves per ply — quiet moves that caused a cutoff elsewhere at the same depth. */
type KillerTable = (Move | undefined)[][];

function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
}

function recordKiller(killers: KillerTable, ply: number, move: Move): void {
  if (move.captured !== undefined) return; // captures are already ordered first
  const slot = (killers[ply] ??= []);
  if (slot[0] !== undefined && sameMove(slot[0], move)) return;
  slot[1] = slot[0];
  slot[0] = move;
}

/**
 * Move-ordering heuristic, best guesses first, so alpha-beta cuts off earlier.
 * Captures lead, ranked MVV-LVA (most valuable victim, least valuable attacker
 * — grabbing a queen with a pawn is a better guess than grabbing it with a
 * queen, which the old captured-value-only ordering could not tell apart),
 * then promotions, then checks (Move.eliminates is not consulted: legalMoves
 * leaves it empty, only applyMove fills it in), then killer moves from siblings.
 */
function orderScore(move: Move, killers: KillerTable, ply: number): number {
  let score = 0;
  if (move.captured !== undefined) {
    score += 1000 + PIECE_VALUES[move.captured.type] * 10 - PIECE_VALUES[move.piece.type];
  }
  if (move.promotion !== undefined) score += 800 + PIECE_VALUES[move.promotion];
  score += move.isCheck.length * 20;

  const slot = killers[ply];
  if (slot !== undefined && move.captured === undefined) {
    if (slot[0] !== undefined && sameMove(slot[0], move)) score += 60;
    else if (slot[1] !== undefined && sameMove(slot[1], move)) score += 40;
  }
  return score;
}

function orderMoves(moves: readonly Move[], killers: KillerTable, ply: number): Move[] {
  return [...moves]
    .map((move) => ({ move, score: orderScore(move, killers, ply) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

/**
 * Pulls decisive scores toward zero by the ply they were found at, so a mate in
 * 1 beats the same mate in 5 and a loss is preferred later over sooner. Without
 * it every winning line scores identically and the bot has no reason to ever
 * actually finish one — it can put mate off indefinitely and still believe it is
 * playing the best move.
 *
 * The discount is small next to the placement credit inside a decisive score,
 * so it separates equally-placed outcomes by speed without ever reordering the
 * places themselves.
 */
function adjustForDistance(value: number, ply: number): number {
  if (value >= MATE_THRESHOLD) return value - ply;
  if (value <= -MATE_THRESHOLD) return value + ply;
  return value;
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
  evaluate: EvaluateFn,
  ply: number,
  killers: KillerTable,
  budget?: SearchOptions["budget"]
): number {
  budget?.visit();
  if (depth === 0 || gamePhase(state) === "finished") {
    return adjustForDistance(evaluate(state, botColor), ply);
  }

  if (state.players[state.turn].kingStatus === "walking") {
    budget?.check();
    return alphaBeta(advanceWalkingKing(state), depth - 1, alpha, beta, botColor, evaluate, ply + 1, killers, budget);
  }
  if (claimSecuresSoleWin(state,state.turn)) return adjustForDistance(evaluate(claimWin(state,state.turn),botColor),ply);
  const moves = orderMoves(legalMoves(state, state.turn), killers, ply);
  const maximizing = state.turn === botColor;
  let value = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    budget?.check();
    const child = applyMove(state, move);
    const childValue = alphaBeta(child, depth - 1, alpha, beta, botColor, evaluate, ply + 1, killers, budget);
    if (maximizing) {
      if (childValue > value) value = childValue;
      if (value > alpha) alpha = value;
    } else {
      if (childValue < value) value = childValue;
      if (value < beta) beta = value;
    }
    if (alpha >= beta) {
      recordKiller(killers, ply, move);
      break;
    }
  }

  return value;
}

function searchRootMove(
  state: GameState,
  move: Move,
  depth: number,
  alpha: number,
  botColor: PlayerColor,
  evaluate: EvaluateFn,
  killers: KillerTable,
  budget?: SearchOptions["budget"]
): number {
  budget?.check();
  return alphaBeta(applyMove(state, move), depth - 1, alpha, Infinity, botColor, evaluate, 1, killers, budget);
}

/**
 * Scores every legal move for `botColor` at the given search depth, best first.
 *
 * The best move and its value are exact. Every other move's value is an upper
 * bound: the root narrows alpha to the best score so far, so a move that fails
 * to beat it returns the window's edge rather than its own value, and the true
 * value may be far below. That is enough to rank the winner and to rule moves
 * out, but not to choose between runners-up — for that, hand the near-best ones
 * to scoreMovesExactly.
 */
export function rankMoves(state: GameState, botColor: PlayerColor, options: SearchOptions): ScoredMove[] {
  const evaluate = options.evaluate ?? evaluateMaterial;
  const killers: KillerTable = [];
  const moves = orderMoves(legalMoves(state, botColor), killers, 0);
  if (moves.length === 0) {
    throw new Error(`rankMoves called for ${botColor} with no legal moves`);
  }

  let alpha = -Infinity;
  const scored: ScoredMove[] = [];
  for (const move of moves) {
    const value = searchRootMove(state, move, options.maxDepth, alpha, botColor, evaluate, killers, options.budget);
    scored.push({ move, value });
    if (value > alpha) alpha = value;
  }

  return scored.sort((a, b) => b.value - a.value);
}

/**
 * Re-scores a specific set of root moves with a full window, so each one comes
 * back with its own value instead of the bound rankMoves may have left it with.
 *
 * Callers that pick among near-equal candidates rather than just taking the
 * winner — the top-K sampling that makes lower difficulties imperfect, the
 * repetition tiebreak in chooseCpuMove — need this, or they end up comparing
 * numbers that were never measurements in the first place. It is a second
 * search over a handful of moves, so ask for it only when the choice is
 * actually going to be made on those numbers.
 */
export function scoreMovesExactly(
  state: GameState,
  botColor: PlayerColor,
  moves: readonly Move[],
  options: SearchOptions
): ScoredMove[] {
  const evaluate = options.evaluate ?? evaluateMaterial;
  const killers: KillerTable = [];
  return moves
    .map((move) => ({
      move,
      value: searchRootMove(state, move, options.maxDepth, -Infinity, botColor, evaluate, killers, options.budget),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Picks the single best legal move for `botColor` at the given search depth. */
export function bestMove(state: GameState, botColor: PlayerColor, options: SearchOptions): Move {
  return rankMoves(state, botColor, options)[0].move;
}
