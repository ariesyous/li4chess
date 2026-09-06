import { ALL_COLORS, GameState, PlayerColor, PIECE_VALUES } from "@li4chess/engine";
import { evaluateFull, evaluateMaterial } from "./evaluate.js";

export type UtilityVector = readonly [number, number, number, number];
export type UtilityFn = (state: GameState, color: PlayerColor) => number;
/** Placement ladder: 1st=3, 2nd=1, 3rd=-1, 4th=-3. */
export function terminalUtility(state: GameState, color: PlayerColor): number | null {
  if (!state.result) return null;
  if (state.result.reason === "abort") return 0;
  return 5 - 2 * state.result.placements.find(p => p.color === color)!.meanRank;
}
export const evaluateUtility: UtilityFn = (state, color) => {
  const terminal = terminalUtility(state, color);
  if (terminal !== null) return terminal;
  // Strictly inside sole-win/fourth-place endpoints. 40 is roughly one army's
  // non-king material; this is an explicit untrained calibration parameter.
  return 2.5 * Math.tanh(evaluateFull(state, color) / 40);
};
export function evaluateVector(state: GameState, evaluate: UtilityFn = evaluateUtility): UtilityVector {
  return ALL_COLORS.map(c => evaluate(state, c)) as unknown as UtilityVector;
}

/** One-feature ablation: compare material with the average active rival, not a three-army coalition. */
export const evaluateRelativeUtility: UtilityFn = (state,color) => {
  if (state.result || state.players[color].status !== "active") return evaluateUtility(state,color);
  const material=[0,0,0,0];
  for (const p of state.board) if (p) material[p.owner]+=PIECE_VALUES[p.type];
  const opponents=ALL_COLORS.filter(c=>c!==color && state.players[c].status==="active");
  const rival=opponents.length ? opponents.reduce((sum,c)=>sum+material[c],0)/opponents.length : 0;
  const raw=evaluateFull(state,color)-evaluateMaterial(state,color)+material[color]-rival;
  return 2.5*Math.tanh(raw/40);
};
