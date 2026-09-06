import type { GameState, Move, SeatConfig } from "@li4chess/engine";
import { assertLocalMigrationState } from "@li4chess/engine";
import { canonicalJson } from "./canonical.js";
import { engineState, projectState } from "./replay.js";
import { validateMove, validateState } from "./validation.js";
export * from "./canonical.js";
export * from "./types.js";
export * from "./replay.js";

/** State-v2 validates imported checkpoints; replay-v2 additionally proves the
 * recorded transitions. Network authority and live clock tracking belong to M3. */
export function serializeGameState(state: GameState): string {
  assertLocalMigrationState(state);
  return canonicalJson(projectState(state));
}

export function deserializeGameState(json: string): GameState {
  const state: unknown = JSON.parse(json);
  validateState(state);
  return engineState(state);
}

export function serializeMove(move: Move): string {
  validateMove(move);
  return canonicalJson(move);
}

export function deserializeMove(json: string): Move {
  const move: unknown = JSON.parse(json);
  validateMove(move);
  return move;
}

/** DTO for requesting a new local game — the same shape a future server's "create game" call would take. */
export interface NewGameRequest {
  readonly seatConfig: SeatConfig;
}

export type { GameState, Move, SeatConfig } from "@li4chess/engine";
