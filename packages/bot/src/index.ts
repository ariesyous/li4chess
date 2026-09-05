import { GameState, Move, PlayerColor } from "@li4chess/engine";
import { DIFFICULTY_PRESETS, DifficultyConfig } from "./difficulty.js";
import { evaluateFull } from "./evaluate.js";
import { rankMoves } from "./search.js";

export * from "./difficulty.js";
export * from "./evaluate.js";
export * from "./search.js";

/**
 * Chooses a move for a CPU-controlled seat at the given difficulty level
 * (1-5): searches to the level's depth using its eval weights, then — at
 * lower levels — picks randomly among the top-K near-equal candidates rather
 * than always the single best, to simulate imperfect play instead of just a
 * shallower one.
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

  if (random() < config.randomness) {
    const pool = ranked.slice(0, Math.max(1, Math.min(config.topK, ranked.length)));
    return pool[Math.floor(random() * pool.length)].move;
  }
  return ranked[0].move;
}
