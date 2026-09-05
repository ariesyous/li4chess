import { GameState, Move, PlayerColor, applyMove, positionKey } from "@li4chess/engine";
import { DIFFICULTY_PRESETS, DifficultyConfig } from "./difficulty.js";
import { evaluateFull } from "./evaluate.js";
import { ScoredMove, SearchOptions, rankMoves, scoreMovesExactly } from "./search.js";

export * from "./difficulty.js";
export * from "./evaluate.js";
export * from "./search.js";

/** Would playing this move recreate a position already reached earlier in the game? */
function repeatsPriorPosition(state: GameState, move: Move): boolean {
  const resulting = applyMove(state, move);
  return (state.positionCounts[positionKey(resulting)] ?? 0) > 0;
}

/**
 * How much worse than the best a move may score and still count as an
 * equal-value alternative worth considering instead.
 */
const CONTENDER_TOLERANCE = 0.5;

/**
 * At most this many near-best moves get re-searched exactly. In a won endgame
 * dozens of moves can sit within a rounding error of each other, and a full
 * second search over all of them costs more than the choice between them is
 * worth — a handful of honest alternatives is plenty to step out of a
 * repetition or to sample from.
 */
const MAX_REFINED_CONTENDERS = 8;

/**
 * The entries within `CONTENDER_TOLERANCE` of the best, given a list already
 * sorted best-first.
 */
function nearBest(scored: readonly ScoredMove[]): ScoredMove[] {
  const cutoff = scored[0].value - CONTENDER_TOLERANCE;
  return scored.filter((entry) => entry.value >= cutoff);
}

/**
 * The pool rule, separated from how exact scores are obtained so it can be
 * tested against controlled values: a real position rarely produces a bound
 * that badly overstates its move, which is exactly the case that has to work.
 *
 * `near` are the candidates chosen by their upper bounds. Rescoring them is not
 * enough on its own — the result has to be filtered again, because a bound only
 * says a move is *no better* than the cutoff and says nothing about how much
 * worse it really is.
 */
export function refineContenders(
  near: readonly ScoredMove[],
  rescore: (moves: readonly Move[]) => ScoredMove[]
): ScoredMove[] {
  if (near.length <= 1) return near.slice(0, 1);
  return nearBest(rescore(near.map((scored) => scored.move)));
}

/**
 * The moves genuinely worth choosing between, each with an exact value.
 *
 * rankMoves leaves everything but the winner holding an upper bound, so the
 * cutoff is applied twice: once against the bounds, to decide what is worth the
 * cost of an exact search (a bound below the cutoff means the real value is
 * below it too, so those are safe to drop), and once against the exact values.
 * Filtering on bounds alone let a move whose bound sat just under the leader
 * survive into the pool with a true value of anything at all, and the
 * repetition preference below would then play it over the leader.
 */
function contenders(
  state: GameState,
  color: PlayerColor,
  ranked: readonly ScoredMove[],
  options: SearchOptions
): ScoredMove[] {
  return refineContenders(nearBest(ranked).slice(0, MAX_REFINED_CONTENDERS), (moves) =>
    scoreMovesExactly(state, color, moves, options)
  );
}

/**
 * Chooses a move for a CPU-controlled seat at the given difficulty level
 * (1-5): searches to the level's depth using its eval weights, then — at
 * lower levels — picks randomly among the top-K near-equal candidates rather
 * than always the single best, to simulate imperfect play instead of just a
 * shallower one.
 *
 * Repetition acts only as a tiebreak: if the move the search likes best would
 * recreate a position already reached this game, equally-good alternatives that
 * don't are preferred instead. Search on its own has no reason to avoid
 * repetition when the eval barely moves, so without this a bot with nothing
 * clearly better to do shuffles back and forth. It is deliberately not a filter
 * over the whole move list, though — the previous version dropped every
 * repeating move outright, which meant a genuinely winning move got thrown away
 * for the crime of passing through a position seen once before.
 */
export function chooseCpuMove(
  state: GameState,
  color: PlayerColor,
  level: DifficultyConfig["level"] = 3,
  random: () => number = Math.random
): Move {
  const config = DIFFICULTY_PRESETS[level];
  const options: SearchOptions = {
    maxDepth: config.maxDepth,
    evaluate: (s, c) => evaluateFull(s, c, config.evalWeights),
  };
  const ranked = rankMoves(state, color, options);

  const topK = Math.max(1, config.topK);
  const sampling = random() < config.randomness;
  const leaderRepeats = repeatsPriorPosition(state, ranked[0].move);
  // Taking the winner needs no alternatives, and rankMoves already scored it
  // exactly. Anything else means comparing runners-up, which costs a second
  // search over them — so only pay for it when the comparison is actually made.
  if (!leaderRepeats && !(sampling && topK > 1)) return ranked[0].move;

  const pool = contenders(state, color, ranked, options);
  const fresh = pool.filter((scored) => !repeatsPriorPosition(state, scored.move));
  const preferred = fresh.length > 0 ? fresh : pool;

  if (sampling) {
    const candidates = preferred.slice(0, Math.min(topK, preferred.length));
    return candidates[Math.floor(random() * candidates.length)].move;
  }
  return preferred[0].move;
}
