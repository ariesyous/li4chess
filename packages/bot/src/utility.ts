import { ALL_COLORS, GameState, PlayerColor, computeGameResult } from "@li4chess/engine";
import { evaluateFull } from "./evaluate.js";

export type UtilityVector = readonly [number, number, number, number];
export type UtilityFn = (state: GameState, color: PlayerColor) => number;
/** Placement ladder: 1st=3, 2nd=1, 3rd=-1, 4th=-3. */
export function terminalUtility(state: GameState, color: PlayerColor): number | null {
  if (!state.result) return null;
  const place = state.result.placements.find(p => p.color === color)!.place;
  if (state.result.reason === "repetition" && state.players[color].status === "active") {
    // Share the occupied ranks among tied survivors, rather than reward four
    // simultaneous sole victories. Two/three/four survivors yield 2/1/0.
    return 4 - ALL_COLORS.filter(c => state.players[c].status === "active").length;
  }
  return 5 - 2 * place;
}
export const evaluateUtility: UtilityFn = (state, color) => {
  const terminal = terminalUtility(state, color);
  if (terminal !== null) return terminal;
  if (state.players[color].status !== "active") {
    return 5 - 2 * computeGameResult(state.players).placements.find(p => p.color === color)!.place;
  }
  // Strictly inside sole-win/fourth-place endpoints. 40 is roughly one army's
  // non-king material; this is an explicit untrained calibration parameter.
  return 2.5 * Math.tanh(evaluateFull(state, color) / 40);
};
export function evaluateVector(state: GameState, evaluate: UtilityFn = evaluateUtility): UtilityVector {
  return ALL_COLORS.map(c => evaluate(state, c)) as unknown as UtilityVector;
}
