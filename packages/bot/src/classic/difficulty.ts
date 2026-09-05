import { EvalWeights, FULL_EVAL_WEIGHTS, MATERIAL_ONLY_WEIGHTS } from "./evaluate.js";

export interface DifficultyConfig {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly maxDepth: number;
  /** Probability of picking a random move among the top-K near-equal candidates instead of the single best. */
  readonly randomness: number;
  readonly topK: number;
  readonly evalWeights: EvalWeights;
}

export const DIFFICULTY_PRESETS: Readonly<Record<DifficultyConfig["level"], DifficultyConfig>> = {
  1: { level: 1, maxDepth: 1, randomness: 0.5, topK: 5, evalWeights: MATERIAL_ONLY_WEIGHTS },
  2: { level: 2, maxDepth: 2, randomness: 0.3, topK: 3, evalWeights: MATERIAL_ONLY_WEIGHTS },
  3: { level: 3, maxDepth: 3, randomness: 0.1, topK: 2, evalWeights: FULL_EVAL_WEIGHTS },
  4: { level: 4, maxDepth: 4, randomness: 0.02, topK: 1, evalWeights: FULL_EVAL_WEIGHTS },
  5: { level: 5, maxDepth: 5, randomness: 0, topK: 1, evalWeights: FULL_EVAL_WEIGHTS },
};
