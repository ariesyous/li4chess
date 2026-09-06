import { GameState } from "./types.js";

/** Format fence only, not a runtime validator for arbitrary network state.
 * Historical snapshots need their producing revision/compatibility reader.
 * The accepted replay-v2 and canonical state-v2 schemas are not implemented yet.
 */
export function assertLocalMigrationState(state: GameState): void {
  if (state?.rulesetId !== null || !Array.isArray(state.enPassantRights) ||
      !Number.isSafeInteger(state.eventSequence) || state.eventSequence < 0 || !Array.isArray(state.awardLedger)) {
    throw new Error("Unsupported state: this reducer accepts only the local partial M1 migration shape");
  }
}
