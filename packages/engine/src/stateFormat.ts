import { ALL_COLORS,GameState } from "./types.js";

/** Format fence only, not a runtime validator for arbitrary network state.
 * Historical snapshots need their producing revision/compatibility reader.
 * The accepted replay-v2 and canonical state-v2 schemas are not implemented yet.
 */
export function assertLocalMigrationState(state: GameState): void {
  if (state?.rulesetId !== null || !Array.isArray(state.enPassantRights) ||
      !Number.isSafeInteger(state.reversibleMoves) || state.reversibleMoves<0 ||
      !Number.isSafeInteger(state.eventSequence) || state.eventSequence < 0 || !Array.isArray(state.awardLedger) ||
      !state.completedMoves || ALL_COLORS.some(c=>!Number.isSafeInteger(state.completedMoves[c]) || state.completedMoves[c]<0) ||
      !/^[0-9a-f]{8}$/.test(state.randomSeed) || !Number.isSafeInteger(state.randomDrawIndex) || state.randomDrawIndex<0 ||
      !Array.isArray(state.randomActions)) {
    throw new Error("Unsupported state: this reducer accepts only the local partial M1 migration shape");
  }
}
