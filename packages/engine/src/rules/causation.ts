import { ALL_COLORS,GameState,PlayerColor } from "../types.js";
import { hasLegalMove } from "./legality.js";

/** Last >=1 -> 0 transition wins; a rescue clears the prior self/other cause. */
export function updateNoMoveCauses(before:GameState,after:GameState,actor:PlayerColor,sequence:number): GameState {
  const players={ ...after.players };
  for (const color of ALL_COLORS) {
    if (players[color].status !== "active") continue;
    if (hasLegalMove(after,color)) {
      if (players[color].noMoveCause) {
        const { noMoveCause:_,...rest }=players[color];
        players[color]=rest;
      }
    } else if (hasLegalMove(before,color)) players[color]={ ...players[color],noMoveCause:{ actor,sequence } };
  }
  return { ...after,players };
}
