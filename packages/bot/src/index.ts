import { GameState, Move, PlayerColor, applyMove, positionKey } from "@li4chess/engine";
import { DIFFICULTY_PRESETS, DifficultyConfig } from "./difficulty.js";
import { evaluateFull } from "./evaluate.js";
import { ScoredMove, rankMoves } from "./search.js";

export * from "./difficulty.js";
export * from "./evaluate.js";
export * from "./search.js";
export * from "./lab-search.js";
export * from "./utility.js";
export * from "./positions.js";
export { chooseCpuMove as chooseClassicMove, DIFFICULTY_PRESETS as CLASSIC_PRESETS } from "./classic/index.js";

/** Would playing this move recreate a position already reached earlier in the game? */
function repeatsPriorPosition(state: GameState, move: Move): boolean {
  const resulting = applyMove(state, move);
  return (state.positionCounts[positionKey(resulting)] ?? 0) > 0;
}

/**
 * Chooses a move for a CPU-controlled seat at the given difficulty level
 * (1-5): searches to the level's depth using its eval weights, then — at
 * lower levels — picks randomly among the top-K near-equal candidates rather
 * than always the single best, to simulate imperfect play instead of just a
 * shallower one.
 *
 * Before any of that, moves that would recreate a position already reached
 * earlier in the game are deprioritized (not eliminated — falls back to the
 * full ranked list if every candidate repeats). Search alone has no reason to
 * avoid repetition when nothing in the static eval changes move-to-move, so
 * without this a bot with no clearly-better tactical move available will
 * happily shuffle back and forth forever instead of trying something new.
 */
export function chooseCpuMove(
  state: GameState,
  color: PlayerColor,
  level: DifficultyConfig["level"] = 3,
  random: () => number = Math.random
): Move {
  const config = DIFFICULTY_PRESETS[level];
  const ranked = rankMoves(state, color, {
    maxDepth: config.maxDepth,
    evaluate: (s, c) => evaluateFull(s, c, config.evalWeights),
  });

  const nonRepeating: ScoredMove[] = ranked.filter((scored) => !repeatsPriorPosition(state, scored.move));
  const pool = nonRepeating.length > 0 ? nonRepeating : ranked;

  if (random() < config.randomness) {
    const topK = pool.slice(0, Math.max(1, Math.min(config.topK, pool.length)));
    return topK[Math.floor(random() * topK.length)].move;
  }
  return pool[0].move;
}
