import { GameState, Move } from "./types.js";
import { applyMove } from "./rules/applyMove.js";
import { legalMoves } from "./rules/legality.js";
import { assertLocalMigrationState } from "./stateFormat.js";

/** Resolve an external intention against the current turn; never trust supplied
 * piece, capture, castle, check, or elimination metadata. Seat authorization is
 * the responsibility of the caller (a future multiplayer server).
 */
export function applyMoveRequest(state: GameState, request: Pick<Move, "from" | "to" | "promotion">): GameState {
  assertLocalMigrationState(state);
  if (state.result !== null) throw new Error("Cannot move in a finished game");
  if (state.players[state.turn].kingStatus === "walking") throw new Error("A walking king requires its recorded random action");
  const move = legalMoves(state).find(candidate => candidate.from === request.from && candidate.to === request.to && (request.promotion === undefined || candidate.promotion === request.promotion));
  if (!move) throw new Error("Request does not match a legal move for the current player");
  return applyMove(state, move);
}

export type GamePhase = "active" | "finished";

/** Convenience accessor: is this game still in progress or has it concluded? */
export function gamePhase(state: GameState): GamePhase {
  return state.result === null ? "active" : "finished";
}
