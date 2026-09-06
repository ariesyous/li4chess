import { ALL_COLORS,GameState,RULESET_ID } from "./types.js";

/** Format fence only, not a runtime validator for arbitrary network state.
 * Historical snapshots need their producing revision/compatibility reader.
 * Untrusted serialized inputs use protocol's complete state-v2/replay-v2 reader.
 */
export function assertLocalMigrationState(state: GameState): void {
  if (state?.rulesetId !== RULESET_ID || !Array.isArray(state.enPassantRights) ||
      !Number.isSafeInteger(state.reversibleMoves) || state.reversibleMoves<0 ||
      !Number.isSafeInteger(state.eventSequence) || state.eventSequence < 0 || !Array.isArray(state.awardLedger) ||
      !state.completedMoves || ALL_COLORS.some(c=>!Number.isSafeInteger(state.completedMoves[c]) || state.completedMoves[c]<0) ||
      !/^[0-9a-f]{8}$/.test(state.randomSeed) || !Number.isSafeInteger(state.randomDrawIndex) || state.randomDrawIndex<0 ||
      !Array.isArray(state.randomActions)) {
    throw new Error("Unsupported state migration: this reducer accepts only complete li4chess-ffa-standard-v1 states");
  }
}
