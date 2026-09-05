import { chooseClassicMove as chooseCpuMove, CLASSIC_PRESETS as DIFFICULTY_PRESETS } from "@li4chess/bot";
import { legalMoves } from "@li4chess/engine";
import { ArenaEngine } from "./index.js";
import { LabOptions, searchPosition } from "@li4chess/bot";

export function experimental(id: string, config: LabOptions): ArenaEngine {
  return { id, config, choose(state) { const result = searchPosition(state,config); return {move:result.move,stats:{...result.stats,stopped:result.stopped}}; } };
}

export function classic(level: 1 | 2 | 3 | 4 | 5 = 5): ArenaEngine {
  return { id: level === 5 ? "classic-v1" : `classic-v1-level${level}`, config: DIFFICULTY_PRESETS[level],
    choose: (state, random) => ({ move: chooseCpuMove(state, state.turn, level, random) }) };
}
export const randomEngine: ArenaEngine = { id: "random-v1", choose(state, random) {
  const moves = legalMoves(state); return { move: moves[Math.floor(random() * moves.length)] };
} };
