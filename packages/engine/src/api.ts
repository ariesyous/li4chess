import { GameState } from "./types.js";

export type GamePhase = "active" | "finished";

/** Convenience accessor: is this game still in progress or has it concluded? */
export function gamePhase(state: GameState): GamePhase {
  return state.result === null ? "active" : "finished";
}
