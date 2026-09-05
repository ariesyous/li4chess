import type { GameState, Move, SeatConfig } from "@li4chess/engine";

/**
 * GameState (and Move/SeatConfig) are already plain JSON-shaped — arrays,
 * plain objects, numbers, and string literals only — by design, precisely so
 * a future networked server can serialize/broadcast the exact same shapes
 * the local UI already works with, with no adapter layer in between.
 */
export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(json: string): GameState {
  return JSON.parse(json) as GameState;
}

export function serializeMove(move: Move): string {
  return JSON.stringify(move);
}

export function deserializeMove(json: string): Move {
  return JSON.parse(json) as Move;
}

/** DTO for requesting a new local game — the same shape a future server's "create game" call would take. */
export interface NewGameRequest {
  readonly seatConfig: SeatConfig;
}

export type { GameState, Move, SeatConfig } from "@li4chess/engine";
